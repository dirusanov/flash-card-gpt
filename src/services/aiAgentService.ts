import { AIService } from './aiServiceFactory';
import { StoredCard } from '../store/reducers/cards';
import { Modes } from '../constants';

// Типы для системы AI агентов
export interface AIAgent {
    name: string;
    role: string;
    systemPrompt: string;
    execute: (input: any, context: WorkflowContext) => Promise<any>;
}

export interface WorkflowContext {
    originalText: string;
    currentStep: string;
    previousResults: { [key: string]: any };
    metadata: {
        textLength: number;
        language: string;
        topic: string;
        complexity: 'simple' | 'medium' | 'advanced';
    };
}

export interface SupervisorDecision {
    strategy: 'single_concept' | 'multiple_concepts' | 'step_by_step' | 'comparison';
    agents: string[];
    instructions: { [agentName: string]: string };
    expectedOutput: string;
    reasoning: string;
}

export interface ContentAnalysis {
    mainTopic: string;
    keyPoints: string[];
    concepts: ConceptInfo[];
    relationships: ConceptRelationship[];
    learningObjectives: string[];
    complexity: 'simple' | 'medium' | 'advanced';
    estimatedCards: number;
    questions?: Array<{
        question: string;
        textChunk: string;
        priority: 'high' | 'medium' | 'low';
    }>;
    analysis?: {
        totalCards: number;
        mainTopics: string[];
        complexity: string;
    };
}

export interface ConceptInfo {
    name: string;
    definition: string;
    importance: 'high' | 'medium' | 'low';
    prerequisites: string[];
    examples: string[];
}

export interface ConceptRelationship {
    from: string;
    to: string;
    type: 'depends_on' | 'part_of' | 'related_to' | 'contradicts';
}

export interface QuestionQuality {
    question: string;
    answer: string;
    qualityScore: number;
    relevanceScore: number;
    difficultyScore: number;
    issues: string[];
    improvements: string[];
    isWorthwhile: boolean;
    reasoning: string;
}

export interface GeneratedCard {
    front: string;
    back: string;
    tags?: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
    imagePrompt?: string;
    concept?: string;
    qualityScore?: number;
    multimedia?: {
        images?: number[];
        formulas?: number[];
        code?: number[];
    };
    attachedImages?: PageImage[];
    attachedFormulas?: FormulaElement[];
    attachedCode?: CodeBlock[];
    image?: string | null;
    imageUrl?: string | null;
}

export interface ValidationResult {
    isValid: boolean;
    overallScore: number;
    cardScores: { [index: number]: number };
    issues: string[];
    suggestions: string[];
    improvedCards?: GeneratedCard[];
    finalRecommendation: string;
}

export interface PageContentContext {
    selectedText: string;
    pageImages: PageImage[];
    formulas: FormulaElement[];
    codeBlocks: CodeBlock[];
    links: LinkElement[];
    metadata: PageMetadata;
}

export interface PageImage {
    src: string;
    alt: string;
    title?: string;
    width?: number;
    height?: number;
    isNearText: boolean;
    relevanceScore: number;
    base64?: string;
}

export interface FormulaElement {
    text: string;
    type: 'latex' | 'mathml' | 'inline' | 'block';
    isNearText: boolean;
    relevanceScore: number;
}

export interface CodeBlock {
    code: string;
    language?: string;
    isNearText: boolean;
    relevanceScore: number;
}

export interface LinkElement {
    url: string;
    text: string;
    isNearText: boolean;
    relevanceScore: number;
}

export interface PageMetadata {
    url: string;
    title: string;
    domain: string;
    language: string;
    hasImages: boolean;
    hasFormulas: boolean;
    hasCode: boolean;
}

export interface ContentEnhancement {
    shouldIncludeImages: boolean;
    selectedImages: PageImage[];
    shouldIncludeFormulas: boolean;
    selectedFormulas: FormulaElement[];
    shouldIncludeCode: boolean;
    selectedCode: CodeBlock[];
    reasoning: string;
}

export interface TextAnalysis {
    textLength: number;
    complexity: 'simple' | 'medium' | 'advanced';
    mainTopics: TopicInfo[];
    estimatedCards: number;
    learningObjectives: string[];
    hasMultimedia: boolean;
    multimediaTypes: string[];
    priority: 'high' | 'medium' | 'low';
    reasoning: string;
}

export interface TopicInfo {
    name: string;
    importance: 'critical' | 'important' | 'useful' | 'optional';
    complexity: 'simple' | 'medium' | 'advanced';
    estimatedCards: number;
    needsMultimedia: boolean;
    multimediaTypes: string[];
    subtopics: string[];
}

export interface CardPlan {
    totalCards: number;
    cardSpecs: CardSpec[];
    multimediaDistribution: MultimediaDistribution;
    learningFlow: string[];
    reasoning: string;
}

export interface CardSpec {
    id: string;
    type: 'concept' | 'definition' | 'example' | 'application' | 'comparison' | 'formula' | 'code';
    topic: string;
    priority: 'high' | 'medium' | 'low';
    difficulty: 'easy' | 'medium' | 'hard';
    needsMultimedia: boolean;
    multimediaTypes: string[];
    estimatedLength: 'short' | 'medium' | 'long';
    description: string;
}

export interface MultimediaDistribution {
    totalImages: number;
    totalFormulas: number;
    totalCode: number;
    assignments: MultimediaAssignment[];
    userSelectedImages: number[];
    reasoning: string;
}

export interface MultimediaAssignment {
    cardId: string;
    imageIndices: number[];
    formulaIndices: number[];
    codeIndices: number[];
    reasoning: string;
}

// Главный класс для управления AI агентами
export class AIAgentService {
    private aiService: AIService;
    private apiKey: string;
    private agents: { [key: string]: AIAgent };
    private cache: Map<string, { cards: GeneratedCard[], timestamp: number }>;

    constructor(aiService: AIService, apiKey: string) {
        this.aiService = aiService;
        this.apiKey = apiKey;
        this.agents = this.initializeAgents();
        this.cache = new Map();
    }

    // Инициализация всех агентов
    private initializeAgents(): { [key: string]: AIAgent } {
        return {
            supervisor: {
                name: 'Supervisor',
                role: 'Управляющий агент',
                systemPrompt: `Ты - Supervisor AI Agent, который управляет процессом создания образовательных карточек.
                Твоя задача - проанализировать текст и определить оптимальную стратегию создания карточек.
                Ты координируешь работу других агентов и принимаешь решения о том, какие агенты должны работать и как.`,
                execute: this.executeSupervisor.bind(this)
            },
            pronunciationAgent: {
                name: 'Pronunciation Agent',
                role: 'Агент транскрипции и произношения (IPA + язык пользователя)',
                systemPrompt: `Ты — специализированный агент по фонетике. Твоя задача — получать корректную транскрипцию изучаемого слова/фразы:

1) USER_LANG — транскрипция с опорой на фонетику/письмо языка интерфейса пользователя
2) IPA — международная фонетическая транскрипция

Требования:
- Строго использовать корректные IPA‑символы (ˈ ˌ ə ɪ ɛ æ ɑ ɔ ʊ ʌ θ ð ʃ ʒ ʧ ʤ ŋ …)
- Никаких лишних комментариев, только данные
- Возвращай ОТДЕЛЬНО значения для USER_LANG и IPA`,
                execute: this.executePronunciationAgent.bind(this)
            },
            contentAnalyzer: {
                name: 'Content Analyzer',
                role: 'Анализатор контента и планировщик вопросов',
                systemPrompt: `Ты - Content Analyzer Agent, эксперт по анализу образовательного контента.

ТВОЯ ЗАДАЧА:
1. Проанализировать выделенный текст
2. Определить сколько карточек нужно создать (от 1 до 5)
3. Разделить текст на логические части
4. Составить список конкретных вопросов для каждой части
5. Убедиться что вопросы основаны ТОЛЬКО на содержании выделенного текста

ПРАВИЛА:
- Минимум 1 карточка, максимум 5
- Каждая карточка должна иметь четкий вопрос
- Вопросы должны проверять понимание, а не память
- Каждый вопрос должен быть связан с конкретной частью текста`,
                execute: this.executeContentAnalyzer.bind(this)
            },
            cardGenerator: {
                name: 'Card Generator',
                role: 'Генератор карточек по конкретным вопросам',
                systemPrompt: `Ты - Card Generator Agent, эксперт по созданию образовательных карточек.

ТВОЯ ЗАДАЧА:
Получить конкретный вопрос и соответствующий кусок текста, и создать качественную карточку.

ПРАВИЛА:
1. Использовать ТОЛЬКО предоставленный текст
2. НЕ придумывать новую информацию
3. Создать четкий вопрос и полный ответ
4. Если есть математические формулы - отметить их специальными маркерами`,
                execute: this.executeCardGenerator.bind(this)
            },
            qualityValidator: {
                name: 'Quality Validator',
                role: 'Проверяющий качество карточек',
                systemPrompt: `Ты - Quality Validator Agent, эксперт по проверке качества образовательных карточек.

ТВОИ ЗАДАЧИ:
1. Проверить соответствие вопроса и ответа
2. Оценить образовательную ценность
3. Проверить наличие дублирования
4. Определить наличие математических формул

КРИТЕРИИ ОТКЛОНЕНИЯ:
- Дублирование ключевых слов
- Отсутствие образовательной ценности
- Несоответствие вопроса и ответа
- Слишком простой или сложный материал`,
                execute: this.validateSingleCard.bind(this)
            },
            mathFormatter: {
                name: 'Math Formatter',
                role: 'Форматировщик математических выражений',
                systemPrompt: `Ты - Math Formatter Agent, эксперт по обработке математических формул.

ТВОЯ ЗАДАЧА:
Получить карточку с математическими формулами и привести их к правильному LaTeX формату.

ПРАВИЛА:
1. Преобразовать формулы в правильный LaTeX
2. Использовать специальные маркеры для разных типов формул
3. Убедиться в правильности математических выражений`,
                execute: this.formatMathInCard.bind(this)
            },
            questionQuality: {
                name: 'Question Quality',
                role: 'Контролер качества вопросов',
                systemPrompt: `Ты - Question Quality Agent, эксперт по разумной оценке качества образовательных вопросов.

ТВОЯ ЗАДАЧА: 
Отфильтровывать только СЕРЬЕЗНО некачественные карточки, пропускать приемлемые.

КРИТЕРИИ ОТКЛОНЕНИЯ (isWorthwhile: false) - ТОЛЬКО СЕРЬЕЗНЫЕ ПРОБЛЕМЫ:
1. ПОЛНОЕ ДУБЛИРОВАНИЕ - вопрос и ответ идентичны по смыслу
2. ТАВТОЛОГИЯ - ответ ничего не объясняет ("X это X")
3. ФАКТИЧЕСКИЕ ОШИБКИ - неправильная информация
4. ПОЛНАЯ БЕССМЫСЛИЦА - невозможно понять

ПРИМЕРЫ ПЛОХИХ КАРТОЧЕК (ОТКЛОНЯЙ):
❌ "Что такое HTML?" → "HTML - это HTML" (ТАВТОЛОГИЯ)
❌ "Что такое лев?" → "Лев - это лев" (ТАВТОЛОГИЯ)
❌ Фактически неверная информация

ПРИМЕРЫ ПРИЕМЛЕМЫХ КАРТОЧЕК (ПРИНИМАЙ):
✅ "Где живут львы?" → "Львы живут в Африке" (простой, но полезный факт)
✅ "Что такое HTML?" → "HTML - язык разметки для веб-страниц" (базовое определение)
✅ "Какие особенности у львов?" → "Грива у самцов, социальный образ жизни" (конкретные факты)

ОПТИМИЗИРОВАННЫЕ ТРЕБОВАНИЯ:
- qualityScore < 5 → isWorthwhile: false (было 6, стало 5)
- Только явная тавтология → серьезный штраф
- Простые факты = приемлемы
- Неточная информация → isWorthwhile: false

БУДЬ РАЗУМНЫМ! Простая карточка лучше, чем отсутствие карточки.`,
                execute: this.executeQuestionQuality.bind(this)
            },
            validator: {
                name: 'Validator',
                role: 'Валидатор и улучшатель',
                systemPrompt: `Ты - Validator Agent, эксперт по быстрой финальной проверке карточек.
                Твоя задача - провести БЫСТРУЮ финальную оценку и дать только КРИТИЧЕСКИ важные рекомендации.
                Сосредоточься только на серьезных проблемах качества, не придирайся к мелочам.
                
                ПРИНЦИПЫ БЫСТРОЙ ВАЛИДАЦИИ:
                1. Только критические проблемы (ошибки фактов, неясности)
                2. Максимум 1-2 конкретных улучшения если они ДЕЙСТВИТЕЛЬНО нужны
                3. Если карточки приемлемы (6+/10) - просто одобряй
                4. НЕ переписывай карточки полностью без крайней необходимости`,
                execute: this.executeValidator.bind(this)
            },
            pageContentAnalyzer: {
                name: 'Page Content Analyzer',
                role: 'Анализатор мультимедийного контента страницы',
                systemPrompt: `Ты - Page Content Analyzer Agent, эксперт по анализу веб-страниц и мультимедийного контента.
                Твоя задача - интеллектуально определить, какие элементы страницы (изображения, формулы, код) 
                должны быть включены в образовательную карточку для лучшего понимания материала.
                Ты принимаешь решения на основе контекста и релевантности контента.`,
                execute: this.executePageContentAnalyzer.bind(this)
            },
            contentEnhancer: {
                name: 'Content Enhancer',
                role: 'Интеллектуальный улучшатель контента карточек',
                systemPrompt: `Ты - Content Enhancer Agent, эксперт по созданию богатого мультимедийного образовательного контента.
                Твоя главная задача - для КАЖДОЙ карточки ИНДИВИДУАЛЬНО определить, какой мультимедиа контент действительно поможет её пониманию.
                НЕ добавляй контент "на всякий случай" - только если он ПРЯМО СВЯЗАН с темой конкретной карточки.
                
                ПРИНЦИПЫ РАБОТЫ:
                1. Анализируй тему каждой карточки отдельно
                2. Добавляй контент только при высокой релевантности (>7/10)
                3. Предпочитай качество количеству
                4. Учитывай контекст: теория, практика, математика, программирование`,
                execute: this.executeContentEnhancer.bind(this)
            },
            cardContentMatcher: {
                name: 'Card Content Matcher',
                role: 'Аналитик соответствия контента карточкам',
                systemPrompt: `Ты - Card Content Matcher Agent, эксперт по анализу соответствия мультимедиа контента конкретным образовательным карточкам.
                Твоя задача - точно определить, какой контент подходит к каждой карточке, основываясь на семантическом анализе и образовательной ценности.`,
                execute: this.executeCardContentMatcher.bind(this)
            },
            textAnalyst: {
                name: 'Text Analyst',
                role: 'Аналитик текста и планировщик обучения',
                systemPrompt: `Ты - Text Analyst Agent, эксперт по глубокому анализу образовательного текста.
                
                ТВОЯ ГЛАВНАЯ ЗАДАЧА:
                1. Анализируй размер и сложность текста
                2. Определи основные темы и подтемы
                3. Оцени, сколько карточек ДЕЙСТВИТЕЛЬНО нужно для понимания
                4. Приоритизируй темы по важности
                5. Учитывай наличие мультимедиа контента
                
                ПРИНЦИПЫ:
                - Большой текст ≠ много карточек (только важные концепты)
                - Качество > количества
                - Фокус на ключевых знаниях для понимания темы
                - Если есть изображения - ОБЯЗАТЕЛЬНО включай их в планирование`,
                execute: this.executeTextAnalyst.bind(this)
            },
            cardPlanner: {
                name: 'Card Planner',
                role: 'Планировщик структуры карточек',
                systemPrompt: `Ты - Card Planner Agent, эксперт по планированию оптимальной структуры образовательных карточек.
                
                ТВОЯ ЗАДАЧА:
                1. Получи анализ от Text Analyst
                2. Создай детальный план карточек
                3. Определи тип каждой карточки (концепт, пример, применение, сравнение)
                4. Спланируй распределение мультимедиа контента
                5. Оптимизируй количество карточек для эффективного обучения
                
                ТИПЫ КАРТОЧЕК:
                - Основные концепты (с изображениями/схемами)
                - Формулы и определения (с формулами)
                - Примеры применения (с кодом/диаграммами)
                - Сравнения и связи
                - Практические вопросы`,
                execute: this.executeCardPlanner.bind(this)
            },
            multimediaAssigner: {
                name: 'Multimedia Assigner',
                role: 'Распределитель мультимедиа контента',
                systemPrompt: `Ты - Multimedia Assigner Agent, эксперт по интеллектуальному распределению мультимедиа контента.

                ОСОБОЕ ВНИМАНИЕ К ИЗОБРАЖЕНИЯМ:
                - Если пользователь выделил изображение - оно ДОЛЖНО попасть в карточку
                - Изображения помогают лучше запомнить материал
                - Каждое изображение должно иметь четкую образовательную цель

                ТВОЯ ЗАДАЧА:
                1. Анализируй план карточек от Card Planner
                2. Точно определи, какой мультимедиа контент к какой карточке подходит
                3. ПРИОРИТЕТ: выделенные пользователем изображения
                4. Обеспечь максимальную образовательную ценность`,
                execute: this.executeMultimediaAssigner.bind(this)
            },
            mathContentProcessor: {
                name: 'Math Content Processor',
                role: 'Обработчик математического контента',
                systemPrompt: `Ты - Math Content Processor Agent, эксперт по обработке математических формул и выражений.

ТВОИ ЗАДАЧИ:
1. РАСПОЗНАВАТЬ математические формулы в тексте
2. ПРЕОБРАЗОВЫВАТЬ формулы в правильный LaTeX формат
3. СОЗДАВАТЬ ЧИСТЫЙ текст для других агентов (без сырых формул)
4. ОБЕСПЕЧИВАТЬ правильное отображение через KaTeX

ПРАВИЛА ОБРАБОТКИ ФОРМУЛ:
- Преобразовывай дроби: 3/4 → \\frac{3}{4}
- Степени: x^2 → x^{2}, m_a^2 → m_{a}^{2}
- Индексы: a_i → a_{i}, m_a → m_{a}
- Греческие буквы: π → \\pi, α → \\alpha, β → \\beta, γ → \\gamma
- Специальные символы: ∑ → \\sum, ∫ → \\int, √ → \\sqrt
- Операторы: =, +, -, ×, ÷ должны быть правильно оформлены
- Не трогай уже правильно оформленные LaTeX формулы
- Для сложных формул используй блочный режим ($$...$$)

СПЕЦИАЛЬНАЯ МАРКИРОВКА ФОРМУЛ:
- Основные формулы: отмечай как [MATH:формула][/MATH]
- Промежуточные вычисления: отмечай как [MATH:inline:формула][/MATH]
- Примеры: отмечай как [MATH:example:формула][/MATH]

ФОРМАТ ВЫВОДА:
{
  "cleanText": "Текст без формул для агентов",
  "formulas": [
    {
      "original": "3/4",
      "latex": "\\frac{3}{4}",
      "type": "inline|block",
      "context": "описание где используется",
      "markedAs": "MATH|inline|example"
    }
  ],
  "processedContent": "Текст с [MATH:формула][/MATH] для формул"
}`,
                execute: this.executeMathContentProcessor.bind(this)
            },
            formulaEnhancer: {
                name: 'Formula Enhancer',
                role: 'Улучшатель математических выражений в карточках',
                systemPrompt: `Ты - Formula Enhancer Agent, эксперт по интеграции математических формул в образовательные карточки.

                ТВОЯ ЗАДАЧА:
                1. Анализировать карточки на наличие математического контента
                2. Определять, какие формулы нужны для каждой карточки
                3. Вставлять формулы в правильные места с помощью плейсхолдеров
                4. Обеспечивать красивый и понятный вид математических выражений

                ПРАВИЛА ИСПОЛЬЗОВАНИЯ СПЕЦИАЛЬНОЙ МАРКИРОВКИ:
                - [MATH:формула][/MATH] для основных формул
                - [MATH:inline:выражение][/MATH] для промежуточных вычислений
                - [MATH:example:пример][/MATH] для примеров
                - Использовать только когда формула ДЕЙСТВИТЕЛЬНО нужна
                - Не добавлять формулы "на всякий случай"

                ТИПЫ ФОРМУЛ:
                - Основные формулы: в начале карточки
                - Промежуточные вычисления: в середине объяснения
                - Итоговые результаты: в конце ответа`,
                execute: this.executeFormulaEnhancer.bind(this)
            }
        };
    }

    // Вспомогательные методы для кэширования
    private getCacheKey(text: string, mode: string): string {
        const hash = this.simpleHash(text + mode);
        return `${hash}_${mode}`;
    }

    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    private getCachedResult(cacheKey: string): GeneratedCard[] | null {
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < 30 * 60 * 1000) { // 30 минут
            console.log('⚡ CACHE HIT: Using cached cards for this text');
            return cached.cards;
        }
        return null;
    }

    private setCachedResult(cacheKey: string, cards: GeneratedCard[]): void {
        // Ограничиваем размер кэша до 10 элементов
        if (this.cache.size >= 10) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, { cards, timestamp: Date.now() });
    }

    // ===== Новая логика транскрипции (агент произношения) =====
    private async executePronunciationAgent(input: { text: string; sourceLanguage: string; userLanguage: string }): Promise<{ userLanguageTranscription: string | null; ipaTranscription: string | null }> {
        const { text, sourceLanguage, userLanguage } = input;
        try {
            // Используем провайдера с его строгим промптом для стабильности
            const { createTranscription } = await import('./aiServiceFactory');
            const transcription = await createTranscription(
                { ...this.aiService },
                this.apiKey,
                text,
                sourceLanguage,
                userLanguage
            );

            return {
                userLanguageTranscription: transcription?.userLanguageTranscription || null,
                ipaTranscription: transcription?.ipaTranscription || null
            };
        } catch (error) {
            console.error('Pronunciation agent failed:', error);
            return { userLanguageTranscription: null, ipaTranscription: null };
        }
    }

    private async getLanguageNameWithCache(languageCode: string): Promise<string> {
        try {
            const cacheKey = `language_name_${languageCode}`;
            const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(cacheKey) : null;
            if (cached) return cached;

            // Fallback к имени через AI (один краткий запрос)
            if (this.aiService.createChatCompletion) {
                const prompt = `Return only the native name of the language with ISO 639-1 code "${languageCode}".`;
                const response = await this.aiService.createChatCompletion(this.apiKey, [
                    { role: 'user', content: prompt }
                ]);
                const name = response?.content?.trim();
                if (name) {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(cacheKey, name);
                    }
                    return name;
                }
            }
        } catch (e) {
            console.warn('getLanguageNameWithCache failed, fallback to code:', e);
        }
        return (languageCode || '').toUpperCase();
    }

    public async generatePronunciationHtml(text: string, sourceLanguage: string, userLanguage: string): Promise<string | null> {
        if (!text || !sourceLanguage || !userLanguage) return null;

        const { userLanguageTranscription, ipaTranscription } = await this.executePronunciationAgent({
            text,
            sourceLanguage,
            userLanguage
        });

        if (!userLanguageTranscription && !ipaTranscription) return null;

        const languageName = await this.getLanguageNameWithCache(userLanguage);
        const blocks: string[] = [];

        if (userLanguageTranscription) {
            blocks.push(
                `<div class="transcription-item user-lang">
                    <span class="transcription-label">${languageName}:</span>
                    <span class="transcription-text">${userLanguageTranscription}</span>
                </div>`
            );
        }
        if (ipaTranscription) {
            const bracketed = ipaTranscription.startsWith('[') ? ipaTranscription : `[${ipaTranscription}]`;
            blocks.push(
                `<div class="transcription-item ipa">
                    <span class="transcription-label">IPA:</span>
                    <span class="transcription-text">${bracketed}</span>
                </div>`
            );
        }

        return blocks.join('\n');
    }

    // 🚀 НОВАЯ АРХИТЕКТУРА: Анализ → Планирование → Параллельная генерация → Проверка → Форматирование
    async createCardsFromTextFast(text: string, pageContext?: PageContentContext, abortSignal?: AbortSignal): Promise<StoredCard[]> {
        try {
            console.log('🎯 NEW ARCHITECTURE: Multi-agent workflow with parallel processing');

            // Проверяем кэш
            const cacheKey = this.getCacheKey(text, 'multi_agent');
            const cachedCards = this.getCachedResult(cacheKey);
            if (cachedCards) {
                console.log('⚡ CACHE HIT: Returning cached cards instantly');
                return this.convertToStoredCards(cachedCards, text);
            }

            // 🧮 ШАГ 0.0: Сверх-быстрый локальный режим для математики/формул (без LLM)
            const simpleMathCard = this.buildSimpleMathCard(text, pageContext);
            if (simpleMathCard) {
                console.log('⚡ SIMPLE MATH PATH: 1 card (title + formula)');
                this.setCachedResult(cacheKey, [simpleMathCard]);
                return this.convertToStoredCards([simpleMathCard], text);
            }

            // ШАГ 0: Супер-быстрый пайплайн ≤3 запросов (1 LLM + локальная обработка формул)
            console.log('⚡ Trying minimal-requests pipeline (≤3 requests)...');
            const minimalCards = await this.createCardsWithMax3Requests(text, abortSignal);
            if (minimalCards && minimalCards.length > 0) {
                this.setCachedResult(cacheKey, minimalCards);
                return this.convertToStoredCards(minimalCards, text);
            }

            // Создаем контекст workflow
            const context: WorkflowContext = {
                originalText: text,
                currentStep: 'analysis',
                previousResults: {},
                metadata: {
                    textLength: text.length,
                    language: this.detectLanguage(text),
                    topic: '',
                    complexity: this.estimateComplexity(text)
                }
            };

            // Добавляем контекст страницы если есть
            if (pageContext) {
                context.previousResults.pageContext = pageContext;
                console.log(`📋 Page context: ${pageContext.pageImages?.length || 0} images, ${pageContext.formulas?.length || 0} formulas, ${pageContext.codeBlocks?.length || 0} code blocks`);
            }

            // Check if cancelled before starting
            if (abortSignal?.aborted) {
                throw new Error('AI card creation was cancelled by user');
            }

            // ШАГ 1: АНАЛИЗ И ПЛАНИРОВАНИЕ (Supervisor Agent)
            console.log('🧠 ШАГ 1: Анализ текста и планирование карточек...');
            const analysisPlan = await this.executeContentAnalyzer(text, context);

            if (analysisPlan && analysisPlan.questions && analysisPlan.questions.length > 0) {
                console.log(`📋 План: ${analysisPlan.questions.length} вопросов для обработки`);
                context.previousResults.analysis = analysisPlan;
            } else {
                // Fallback на старую систему если анализ не удался
                console.log('⚠️ Анализ не удался, используем fallback');
                return this.createCardsFromTextFallback(text, pageContext, context, abortSignal);
            }

            // ШАГ 2: ПАРАЛЛЕЛЬНАЯ ГЕНЕРАЦИЯ КАРТОЧЕК
            console.log('🔄 ШАГ 2: Параллельная генерация карточек...');
            const rawCards = await this.executeParallelCardGeneration(analysisPlan, context, abortSignal);

            if (!rawCards || rawCards.length === 0) {
                throw new Error('Не удалось сгенерировать карточки');
            }

            // ШАГ 3: ПРОВЕРКА КАЧЕСТВА
            console.log('✅ ШАГ 3: Проверка качества карточек...');
            const validatedCards = await this.executeQualityValidation(rawCards, context, abortSignal);

            // ШАГ 4: ОБРАБОТКА МАТЕМАТИЧЕСКИХ ФОРМУЛ
            console.log('📐 ШАГ 4: Обработка математических формул...');
            const mathProcessedCards = await this.executeMathFormatting(validatedCards, context, abortSignal);

            // ШАГ 5: ПРИМЕНЕНИЕ МУЛЬТИМЕДИА
            console.log('🎨 ШАГ 5: Применение мультимедиа и финальная обработка...');
            const finalCards = await this.applyMultimediaAndFormatting(mathProcessedCards, pageContext, context, abortSignal);

            console.log(`🎉 МУЛЬТИ-АГЕНТНЫЙ WORKFLOW ЗАВЕРШЕН: ${finalCards.length} карточек создано`);

            // Сохраняем результат в кэш
            this.setCachedResult(cacheKey, finalCards);

            return this.convertToStoredCards(finalCards, text);

        } catch (error) {
            console.error('❌ Error in multi-agent workflow:', error);
            // Fallback на простую систему
            return this.createCardsFromTextFallback(text, pageContext, undefined, abortSignal);
        }
    }

    // Быстрый локальный детектор/конструктор одной карточки (название + формула)
    private buildSimpleMathCard(text: string, pageContext?: PageContentContext): GeneratedCard | null {
        const raw = (text || '').trim();
        if (!raw) return null;
        const t = raw.toLowerCase();
        const looksMath = /(теорем|формул|правил|lemma|theorem|formula|rule)/i.test(t)
            || /\$\$|\$|\\frac|\\sqrt|\\tan|\\sin|\\cos|tg|ctg|sin|cos|tan|=/.test(raw)
            || /\([^\n()]+\)\s*\/\s*\([^\n()]+\)/.test(raw);
        if (!looksMath) return null;

        // 1) Санация мусора (MathML/HTML/невидимые символы)
        const cleaned = this.quickSanitizeForMath(raw);

        // 2) Получаем LaTeX формулу (первая подходящая)
        let latex = this.extractFirstLatexFormula(cleaned);
        // Если в выделении нет LaTeX — попробуем забрать ближайшую формулу со страницы
        if (!latex && pageContext?.formulas && pageContext.formulas.length > 0) {
            const best = [...pageContext.formulas]
                .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))[0];
            if (best?.text) {
                const candidate = this.extractFirstLatexFormula(this.quickSanitizeForMath(best.text));
                if (candidate) latex = candidate;
            }
        }
        if (!latex) return null;

        // 3) Извлекаем название
        const front = this.extractFormulaTitle(raw) || 'Формула';
        const back = latex; // оставляем KaTeX/LaTeX — отрисуется позже

        return { front, back, tags: ['math'], difficulty: 'easy', concept: 'formula' } as GeneratedCard;
    }

    private quickSanitizeForMath(text: string): string {
        return text
            .replace(/[\u200B-\u200D\u2060\u2061\uFEFF\u00A0]/g, ' ')
            .replace(/<annotation[\s\S]*?<\/annotation>/gi, '')
            .replace(/application[^a-zA-Z]*x?[^a-zA-Z]*tex/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/https?:\/\/\s*w\s*3\s*\.\s*o\s*r\s*g\s*\/\s*1998\s*\/\s*Math\s*\/\s*MathML/gi, '')
            .replace(/\bw\s*3\s*\.\s*o\s*r\s*g\b/gi, '')
            .replace(/\b1998\s*org\s*\/?/gi, '')
            .replace(/\borg\s*1998\b/gi, '')
            .replace(/\b1998\s*\/\s*Math\s*\/\s*MathML\b/gi, '')
            .replace(/MathMLMath/gi, '')
            .replace(/\bMathML\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private extractFirstLatexFormula(text: string): string | null {
        // Используем те же эвристики, что и в рендерере
        const { processLatexInContent } = require('../utils/katexRenderer');
        const processed = processLatexInContent(text);
        const block = processed.match(/\$\$([^$]+)\$\$/);
        if (block) return `$$${block[1].trim()}$$`;
        const inline = processed.match(/(?<!\$)\$([^$\n]+)\$(?!\$)/);
        if (inline) return `$$${inline[1].trim()}$$`;
        const frac = processed.match(/\(\s*([^()]+?)\s*\)\s*\/\s*\(\s*([^()]+?)\s*\)/);
        if (frac) return `$$\\frac{${frac[1]}}{${frac[2]}}$$`;
        return null;
    }

    private extractFormulaTitle(text: string): string | null {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const joined = lines.join(' ');
        const m1 = joined.match(/\b(Теорема|Формула|Правило)\s+([^:\n]+)\b/i);
        if (m1) return `${m1[1]} ${m1[2]}`.trim();
        const m2 = lines[0]?.match(/^([A-ZА-ЯЁ][^:]{2,80})/);
        if (m2) return m2[1].trim();
        return null;
    }

    // Супер-быстрый конвейер: Классификатор → Сегментация → Нормализация формул (1 LLM вызов) → KaTeX (локально)
    private async createCardsWithMax3Requests(text: string, abortSignal?: AbortSignal): Promise<GeneratedCard[]> {
        try {
            if (abortSignal?.aborted) {
                throw new Error('AI card creation was cancelled by user');
            }

            const prompt = `Ты — КЛАССИФИКАТОР/СЕГМЕНТАТОР для карточек Anki.

ЗАДАЧА:
1) Разбей текст на атомарные факты (не более 3 карточек суммарно)
2) Для каждого факта выбери тип карточки:
   - basic: простой вопрос-ответ (определения, термины, факты)
   - cloze: предложение с пропусками {{c1::...}}
   - derivation: шаги вывода/доказательства (кратко, по пунктам)
3) ЕСЛИ ЕСТЬ МАТЕМАТИКА — НЕ ВСТАВЛЯЙ СЫРОЙ LaTeX В ТЕКСТ. ВМЕСТО ЭТОГО:
   - Замени формулу на плейсхолдер [[F0]], [[F1]], ... в нужном месте текста
   - В отдельном массиве formulas верни latex и режим отображения: "inline" | "block"
4) НЕ используй фразы «по выделенному тексту», «в тексте» и т.п.
5) Ответ только в JSON по схеме ниже.

ВХОДНОЙ ТЕКСТ:
"""
${text}
"""

ФОРМАТ ОТВЕТА (JSON):
{
  "cards": [
    {
      "type": "basic" | "cloze" | "derivation",
      "front": "строка для лицевой стороны (для cloze — предложение с {{c1::...}}). Математика заменена на [[F#]]",
      "back": "краткий ответ. Математика заменена на [[F#]]",
      "tags": ["auto"],
      "difficulty": "easy" | "medium" | "hard"
    }
  ],
  "formulas": [
    { "id": "F0", "latex": "m_{a}^{2} + m_{b}^{2}", "display": "inline" },
    { "id": "F1", "latex": "g = \\frac{(d-1)(d-2)}{2} - s", "display": "block" }
  ]
}`;

            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: 'Ты генерируешь карточки быстро и корректно. Формулы — только валидный LaTeX с $ или $$.' },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                return [];
            }

            const parsed = this.parseJSONResponse(response.content, 'classifierSegmenter');

            // Подготовим карту формул
            const formulaMap: Record<string, { latex: string; display: 'inline' | 'block' }> = {};
            if (Array.isArray(parsed?.formulas)) {
                for (const f of parsed.formulas) {
                    if (f && typeof f.id === 'string' && typeof f.latex === 'string') {
                        const display = (f.display === 'inline' ? 'inline' : 'block') as 'inline' | 'block';
                        formulaMap[f.id] = { latex: f.latex, display };
                    }
                }
            }

            let cards: GeneratedCard[] = Array.isArray(parsed?.cards)
                ? parsed.cards.slice(0, 3).map((c: any) => ({
                    front: this.injectFormulas(String(c.front || ''), formulaMap),
                    back: this.injectFormulas(String(c.back || ''), formulaMap),
                    tags: Array.isArray(c.tags) ? c.tags : ['auto'],
                    difficulty: (c.difficulty as any) || 'medium',
                    concept: c.type || 'basic'
                }))
                : [];

            // Локальная проверка качества (без дополнительных запросов)
            const original = text.toLowerCase();
            cards = cards.filter((card) => {
                const related = this.checkTextRelation((card.front + ' ' + card.back).toLowerCase(), original);
                const notTautology = !this.checkTautology(card.front, card.back);
                const valuable = this.checkEducationalValue(card.front, card.back);
                return related && notTautology && valuable;
            });

            if (cards.length === 0) {
                return [];
            }

            // Локальная пост-обработка формул (KaTeX)
            try {
                const pretty = await this.processLatexInCards(cards);
                return pretty;
            } catch (e) {
                console.warn('KaTeX post-processing failed, returning raw cards');
                return cards;
            }
        } catch (e) {
            console.warn('Minimal-requests pipeline failed:', e);
            return [];
        }
    }

    // Вставка формул по плейсхолдерам [[F#]] c учетом display/inline
    private injectFormulas(input: string, map: Record<string, { latex: string; display: 'inline' | 'block' }>): string {
        let output = input.replace(/\\n/g, '\n');
        output = output.replace(/\[\[F(\d+)\]\]/g, (m, num) => {
            const id = `F${num}`;
            const f = map[id];
            if (!f) return m;
            const latex = f.latex
                .replace(/\\{2,}([A-Za-z]+)/g, '\\$1')
                .replace(/\|/g, ' \\mid ');
            return f.display === 'inline' ? `$${latex}$` : `$$${latex}$$`;
        });
        return output;
    }

    // Быстрый комбинированный процесс: анализ + генерация в одном API вызове
    private async executeFastCombinedProcess(
        text: string,
        pageContext: PageContentContext | undefined,
        context: WorkflowContext,
        abortSignal?: AbortSignal
    ): Promise<{ cards: GeneratedCard[], analysis: any }> {

        const hasMultimedia = pageContext && (pageContext.pageImages?.length > 0 || pageContext.formulas?.length > 0 || pageContext.codeBlocks?.length > 0);
        const hasMathContent = context.previousResults?.mathContent;

        const fastPrompt = `Ты - ГЕНЕРАТОР КАРТОЧЕК. Создай карточки на основе предоставленного текста:

ТЕКСТ: "${text}"

${hasMathContent ? 'МАТЕМАТИЧЕСКИЙ КОНТЕНТ: ОБРАБОТАН (формулы будут добавлены отдельно)' : 'МАТЕМАТИЧЕСКОГО КОНТЕНТА: нет'}
${hasMultimedia ? `ИЗОБРАЖЕНИЯ: ${pageContext?.pageImages?.length || 0} шт` : 'ИЗОБРАЖЕНИЙ: нет'}

СТРОГИЕ ПРАВИЛА:
1. Создавай вопросы, которые НЕ содержат фраз типа "по выделенному тексту", "в тексте", "как указано"
2. Вопросы должны быть естественными и конкретными
3. НЕ добавляй лишние слова - вопрос должен быть прямым
4. Максимум 3 карточки
5. Фокус на понимании, а не на механическом запоминании
6. НЕ включай сырые математические формулы в текст - они будут добавлены отдельно

ПЛОХИЕ ПРИМЕРЫ (НЕ ДЕЛАТЬ):
❌ "Как по выделенному тексту вычислить..."
❌ "Что говорится в тексте о..."
❌ "Какая формула приведена..."
❌ Вставка сырых формул типа "m_a^2 + m_b^2 + m_c^2 = 3/4 S"

ХОРОШИЕ ПРИМЕРЫ:
✅ "Как вычислить сумму квадратов медиан треугольника?"
✅ "Какие стороны треугольника связаны с медианами?"
✅ "Что означает соотношение для медиан в треугольнике?"
✅ Описательные вопросы без сырых формул

JSON:
{
  "cards": [
    {
      "front": "Прямой конкретный вопрос без лишних слов",
      "back": "Полный ответ с объяснением (формулы будут добавлены отдельно)",
      "difficulty": "medium",
      "concept": "Основная тема",
      "tags": ["выделенный_текст"]
    }
  ]
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: 'Ты - быстрый генератор качественных образовательных карточек. Фокус на скорости и качестве.' },
                { role: 'user', content: fastPrompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from fast process');
            }

            const result = this.parseJSONResponse(response.content, 'fastCombined');

            if (!result.cards || !Array.isArray(result.cards) || result.cards.length === 0) {
                throw new Error('No cards generated');
            }

            console.log(`⚡ FAST: Generated ${result.cards.length} cards in single API call`);
            return result;

        } catch (error) {
            console.error('Fast combined process error:', error);
            return this.createFallbackCardsSimple(text);
        }
    }

    // Быстрая параллельная проверка качества с учетом выделенного текста
    private async executeFastQualityValidation(
        cards: GeneratedCard[],
        context: WorkflowContext,
        abortSignal?: AbortSignal
    ): Promise<GeneratedCard[]> {

        const originalText = context.originalText?.toLowerCase() || '';

        const qualityCards = cards.filter((card: GeneratedCard) => {
            const cardText = (card.front + ' ' + card.back).toLowerCase();

            // ПРОВЕРКА 1: Карточка должна быть основана на выделенном тексте
            const hasTextRelation = this.checkTextRelation(cardText, originalText);
            if (!hasTextRelation) {
                console.log('❌ Карточка отклонена: не соответствует выделенному тексту', card.front);
                return false;
            }

            // ПРОВЕРКА 2: Наличие тавтологии (дублирования ключевых слов)
            const hasTautology = this.checkTautology(card.front, card.back);
            if (hasTautology) {
                console.log('❌ Карточка отклонена: тавтология', card.front);
                return false;
            }

            // ПРОВЕРКА 3: Образовательная ценность
            const hasEducationalValue = this.checkEducationalValue(card.front, card.back);
            if (!hasEducationalValue) {
                console.log('❌ Карточка отклонена: нет образовательной ценности', card.front);
                return false;
            }

            return true;
        });

        console.log(`⚡ FAST Quality: ${qualityCards.length}/${cards.length} cards passed validation`);
        return qualityCards.length > 0 ? qualityCards : cards;
    }

    // Проверка соответствия карточки выделенному тексту
    private checkTextRelation(cardText: string, originalText: string): boolean {
        // Разбиваем текст на слова и ключевые фразы
        const originalWords = originalText.split(/\s+/).filter(word => word.length > 2);
        const cardWords = cardText.split(/\s+/).filter(word => word.length > 2);

        // Проверяем наличие общих значимых слов
        const commonWords = originalWords.filter(word =>
            cardWords.some(cardWord => cardWord.includes(word) || word.includes(cardWord))
        );

        // Карточка должна содержать хотя бы 2 общих слова с выделенным текстом
        const hasEnoughCommonWords = commonWords.length >= 2;

        // Или содержать ключевую фразу из оригинального текста
        const hasKeyPhrase = originalWords.some(word =>
            word.length > 5 && cardText.includes(word)
        );

        return hasEnoughCommonWords || hasKeyPhrase;
    }

    // Проверка на тавтологию
    private checkTautology(front: string, back: string): boolean {
        const frontWords = front.toLowerCase().split(/\s+/).filter(word => word.length > 2);
        const backWords = back.toLowerCase().split(/\s+/).filter(word => word.length > 2);

        // Проверяем дублирование ключевых слов
        const duplicates = frontWords.filter(word =>
            backWords.some(backWord => backWord.includes(word) && word !== backWord)
        );

        return duplicates.length > frontWords.length * 0.3; // >30% дублирования
    }

    // Проверка образовательной ценности
    private checkEducationalValue(front: string, back: string): boolean {
        // Карточка должна содержать новую информацию
        const frontLength = front.trim().length;
        const backLength = back.trim().length;

        // Ответ должен быть информативнее вопроса
        if (backLength < frontLength * 1.5) {
            return false;
        }

        // Запрещенные фразы в вопросах
        const forbiddenPhrases = [
            'по выделенному тексту',
            'в выделенном тексте',
            'как указано',
            'что говорится',
            'какая формула приведена',
            'что важно в этом',
            'какой ключевой момент содержится'
        ];

        const questionLower = front.toLowerCase();
        for (const phrase of forbiddenPhrases) {
            if (questionLower.includes(phrase)) {
                console.log(`❌ Запрещенная фраза в вопросе: "${phrase}"`);
                return false;
            }
        }

        // Избегаем вопросов типа "Что такое X?" с ответом "X это X"
        const questionWords = front.toLowerCase();
        const answerWords = back.toLowerCase();

        if (questionWords.includes('что такое') && answerWords.includes('это')) {
            const questionParts = questionWords.split('что такое')[1]?.trim();
            if (questionParts && answerWords.includes(questionParts.split(' ')[0])) {
                return false;
            }
        }

        return true;
    }

    // Быстрое применение мультимедиа и формул с учетом релевантности
    private applyMultimediaFast(cards: GeneratedCard[], pageContext?: PageContentContext, mathContent?: any): GeneratedCard[] {
        console.log(`🎨 Применение мультимедиа: ${pageContext?.pageImages?.length || 0} изображений для ${cards.length} карточек`);
        console.log(`📐 Математические формулы: ${mathContent?.formulas?.length || 0} шт`);

        return cards.map((card: GeneratedCard, index: number) => {
            let enhancedCard = { ...card };

            // Обработка изображений
            if (pageContext?.pageImages?.length) {
                const images = pageContext.pageImages;
                const relevantImages = this.findRelevantImagesForCard(card, images);

                if (relevantImages.length > 0) {
                    const primaryImage = relevantImages[0];
                    console.log(`🖼️ Карточка ${index + 1}: ${relevantImages.length} релевантных изображений`);

                    enhancedCard = {
                        ...enhancedCard,
                        attachedImages: relevantImages,
                        image: primaryImage.base64 || null,
                        imageUrl: primaryImage.src || null
                    };
                }
            }

            // Обработка математических формул
            if (mathContent?.formulas?.length) {
                enhancedCard = this.applyFormulasToCard(enhancedCard, mathContent.formulas);
                console.log(`📐 Карточка ${index + 1}: обработаны математические формулы`);
            }

            return enhancedCard;
        });
    }

    // Применение математических формул к карточке
    private applyFormulasToCard(card: GeneratedCard, formulas: any[]): GeneratedCard {
        let enhancedBack = card.back;

        // ШАГ 1: Сначала обрабатываем сырые формулы в тексте
        enhancedBack = this.processRawFormulasInText(enhancedBack);

        // ШАГ 2: Ищем маркеры [MATH:...][/MATH] и заменяем их на соответствующие формулы
        formulas.forEach((formula, index) => {
            // Ищем различные типы маркеров
            const markers = [
                `[MATH:${formula.original}][/MATH]`,
                `[MATH:inline:${formula.original}][/MATH]`,
                `[MATH:example:${formula.original}][/MATH]`
            ];

            markers.forEach(marker => {
                if (enhancedBack.includes(marker)) {
                    // Проверяем, не дублируется ли формула в текстовом виде
                    if (this.hasFormulaDuplicate(enhancedBack, formula)) {
                        console.log(`⚠️ Пропускаем дублирующуюся формулу ${marker}`);
                        enhancedBack = enhancedBack.replace(marker, '');
                        return;
                    }

                    // Определяем тип формулы на основе маркера
                    let formulaType = 'block';
                    if (marker.includes('inline:')) {
                        formulaType = 'inline';
                    } else if (marker.includes('example:')) {
                        formulaType = 'example';
                    }

                    const latexFormula = this.createLatexFormula(formula, formulaType);
                    enhancedBack = enhancedBack.replace(marker, latexFormula);
                    console.log(`🔄 Замена ${marker} на LaTeX формулу в карточке`);
                }
            });
        });

        return {
            ...card,
            back: enhancedBack
        };
    }

    // Создание LaTeX формулы на основе типа
    private createLatexFormula(formula: any, type: string): string {
        const latex = formula.latex;

        switch (type) {
            case 'inline':
                return `$${latex}$`;
            case 'example':
                return `<div style="border: 2px solid #3B82F6; border-radius: 8px; padding: 12px; margin: 8px 0; background: #F0F9FF;">$$${latex}$$</div>`;
            case 'block':
            default:
                return `$$${latex}$$`;
        }
    }

    // Проверка на дублирование формулы в текстовом виде
    private hasFormulaDuplicate(text: string, formula: any): boolean {
        const lowerText = text.toLowerCase();
        const originalFormula = (formula.original || '').toLowerCase();

        // Проверяем, есть ли оригинальная формула в тексте
        if (originalFormula && lowerText.includes(originalFormula)) {
            return true;
        }

        // Проверяем на похожие выражения
        const latexParts = formula.latex.toLowerCase().split(/[^a-zA-Z0-9]/);
        const significantParts = latexParts.filter((part: string) => part.length > 2);

        let matchCount = 0;
        significantParts.forEach((part: string) => {
            if (lowerText.includes(part)) {
                matchCount++;
            }
        });

        // Если больше 50% значимых частей совпадают, считаем дубликатом
        return matchCount > significantParts.length * 0.5;
    }

    // Обработка сырых математических формул в тексте карточки
    private processRawFormulasInText(text: string): string {
        let processedText = text;

        // Обрабатываем выражения типа "($\frac{3}{4}$)" -> "$$$\frac{3}{4}$$$"
        processedText = processedText.replace(/\(\$\s*([^$]+)\s*\$\)/g, (match, formula) => {
            return `$$${formula}$$`;
        });

        // Обрабатываем выражения типа "$$\frac{3}{4}$$" -> "$$$\frac{3}{4}$$$"
        processedText = processedText.replace(/\$\$\s*([^$]+)\s*\$\$/g, (match, formula) => {
            return `$$${formula}$$`;
        });

        // Обрабатываем выражения типа "($$1^{2}$ +$$1^{2}$ +$$1^{2}$)" -> исправляем и форматируем
        processedText = processedText.replace(/\(\$\$\s*([^$]+)\s*\$\$\)/g, (match, formula) => {
            let fixedFormula = this.fixFormulaErrors(formula);
            return `$$${fixedFormula}$$`;
        });

        // Обрабатываем одиночные формулы типа "$$1^{2}$" -> "$$$1^{2}$$$"
        processedText = processedText.replace(/\$\$\s*([^$]+?)\s*\$\$/g, (match, formula) => {
            let fixedFormula = this.fixFormulaErrors(formula);
            return `$$${fixedFormula}$$`;
        });

        // Обрабатываем inline формулы типа "$...$" оставляем как есть для KaTeX

        console.log('🔧 Processed raw formulas in text');
        return processedText;
    }

    // Исправление распространенных ошибок в формулах
    private fixFormulaErrors(formula: string): string {
        let fixedFormula = formula;

        // Заменяем плейсхолдеры типа "1^{2}" на правильные переменные
        fixedFormula = fixedFormula.replace(/1\^{2}/g, 'a^{2}');
        fixedFormula = fixedFormula.replace(/2\^{2}/g, 'b^{2}');
        fixedFormula = fixedFormula.replace(/3\^{2}/g, 'c^{2}');

        // Исправляем распространенные ошибки форматирования
        fixedFormula = fixedFormula.replace(/\\\(/g, '('); // Убираем лишние escaping
        fixedFormula = fixedFormula.replace(/\\\)/g, ')');

        // Добавляем правильные фигурные скобки для индексов и степеней
        fixedFormula = fixedFormula.replace(/m_a/g, 'm_{a}');
        fixedFormula = fixedFormula.replace(/m_b/g, 'm_{b}');
        fixedFormula = fixedFormula.replace(/m_c/g, 'm_{c}');

        // Исправляем дроби
        fixedFormula = fixedFormula.replace(/\\frac\s*\{\s*3\s*\}\s*\{\s*4\s*\}/g, '\\frac{3}{4}');
        fixedFormula = fixedFormula.replace(/\\\(\s*\\frac\s*\{\s*3\s*\}\s*\{\s*4\s*\}\s*\\\)/g, '\\frac{3}{4}');

        console.log(`🔧 Fixed formula: "${formula}" → "${fixedFormula}"`);
        return fixedFormula;
    }

    // Поиск релевантных изображений для карточки
    private findRelevantImagesForCard(card: GeneratedCard, images: PageImage[]): PageImage[] {
        const cardText = (card.front + ' ' + card.back + ' ' + (card.concept || '')).toLowerCase();
        const cardWords = cardText.split(/\s+/).filter(word => word.length > 2);

        // Фильтруем изображения, исключая те, что содержат общие математические термины
        const filteredImages = images.filter(image => {
            const altText = (image.alt || '').toLowerCase();
            const titleText = (image.title || '').toLowerCase();

            // Исключаем изображения с общими математическими терминами, если карточка не о математике
            const mathTerms = ['формула', 'теорема', 'доказательство', 'математика', 'алгебра', 'геометрия'];
            const hasMathTerm = mathTerms.some(term => altText.includes(term) || titleText.includes(term));
            const isMathCard = cardText.includes('математик') || cardText.includes('формул') ||
                              cardText.includes('теорем') || cardText.includes('доказательств');

            if (hasMathTerm && !isMathCard) {
                console.log(`⚠️ Исключаем математическое изображение для нематематической карточки: ${altText}`);
                return false;
            }

            return true;
        });

        // Оцениваем релевантность каждого изображения
        const scoredImages = filteredImages.map(image => {
            const altText = (image.alt || '').toLowerCase();
            const titleText = (image.title || '').toLowerCase();

            let score = 0;
            let matches = 0;

            // Проверяем совпадения слов в alt тексте
            cardWords.forEach(word => {
                if (altText.includes(word)) {
                    score += 3; // Высокий вес для alt текста
                    matches++;
                }
                if (titleText.includes(word)) {
                    score += 2; // Средний вес для title
                    matches++;
                }
            });

            // Проверяем семантическую близость ключевых терминов
            const keyTerms = this.extractKeyTerms(cardText);
            keyTerms.forEach(term => {
                if (altText.includes(term.toLowerCase())) {
                    score += 5; // Очень высокий вес для ключевых терминов
                    matches++;
                }
            });

            // Учитываем уже рассчитанную релевантность из pageContext
            score += (image.relevanceScore || 0) * 2;

            // Бонус за близость к выделенному тексту
            if (image.isNearText) {
                score += 2;
            }

            // Штраф за слишком общие описания
            if (altText.length < 10 || altText.includes('изображение') || altText.includes('картинка')) {
                score -= 2;
            }

            return {
                image,
                score,
                matches
            };
        });

        // Сортируем по релевантности и возвращаем топ изображений
        const relevantImages = scoredImages
            .filter(item => item.score > 3) // Повышенный порог релевантности
            .sort((a, b) => b.score - a.score)
            .slice(0, 1) // Максимум 1 изображение на карточку для избежания перегрузки
            .map(item => item.image);

        if (relevantImages.length > 0) {
            console.log(`🖼️ Найдено ${relevantImages.length} релевантное изображение для карточки`);
        }

        return relevantImages;
    }

    // Извлечение ключевых терминов из текста карточки
    private extractKeyTerms(text: string): string[] {
        const words = text.split(/\s+/);
        const terms: string[] = [];

        // Ищем существительные (простая эвристика)
        for (let i = 0; i < words.length; i++) {
            const word = words[i].toLowerCase();

            // Пропускаем короткие слова и стоп-слова
            if (word.length < 4) continue;
            if (['что', 'как', 'для', 'это', 'при', 'для', 'или', 'из', 'на', 'по', 'от', 'до'].includes(word)) continue;

            // Добавляем слово как потенциальный термин
            if (!terms.includes(word)) {
                terms.push(word);
            }

            // Ищем биграммы (два слова подряд)
            if (i < words.length - 1) {
                const nextWord = words[i + 1].toLowerCase();
                if (nextWord.length > 2 && !['и', 'а', 'но', 'или', 'из', 'на', 'по', 'от', 'до'].includes(nextWord)) {
                    const bigram = `${word} ${nextWord}`;
                    if (bigram.length > 6 && !terms.includes(bigram)) {
                        terms.push(bigram);
                    }
                }
            }
        }

        return terms.slice(0, 5); // Ограничиваем до 5 ключевых терминов
    }

    // Простой fallback для быстрой генерации по выделенному тексту
    private createFallbackCardsSimple(text: string): { cards: GeneratedCard[], analysis: any } {
        const cards: GeneratedCard[] = [];

        // Извлекаем ключевые предложения из выделенного текста
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

        if (sentences.length > 0) {
            // Первая карточка - о ключевом факте или концепте
            const firstSentence = sentences[0].trim();
            if (firstSentence.length > 20) {
                cards.push({
                    front: `Какой ключевой момент здесь важен?`,
                    back: firstSentence,
                    difficulty: 'medium',
                    concept: 'Ключевой момент',
                    tags: ['выделенный_текст']
                });
            }
        }

        if (sentences.length > 1) {
            // Вторая карточка - о связи или следствии
            const secondSentence = sentences[1].trim();
            if (secondSentence.length > 20 && secondSentence !== sentences[0].trim()) {
                cards.push({
                    front: `Что является важным следствием?`,
                    back: secondSentence,
                    difficulty: 'medium',
                    concept: 'Связь идей',
                    tags: ['выделенный_текст']
                });
            }
        }

        // Если не удалось создать карточки из предложений, создаем общую карточку
        if (cards.length === 0) {
            cards.push({
                front: `Что здесь является самым важным?`,
                back: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
                difficulty: 'medium',
                concept: 'Выделенный контент',
                tags: ['выделенный_текст']
            });
        }

        console.log(`⚠️ Fallback: созданы ${cards.length} простые карточки из выделенного текста`);

        return {
            cards,
            analysis: {
                mainTopic: 'Выделенный текст',
                complexity: 'medium',
                estimatedCards: cards.length,
                hasMultimedia: false
            }
        };
    }


    // Supervisor Agent - управляет процессом
    private async executeSupervisor(text: string, context: WorkflowContext): Promise<SupervisorDecision> {
        const prompt = `Ты - Supervisor AI Agent. Проанализируй текст и определи оптимальную стратегию создания карточек.

ТЕКСТ: "${text}"

КОНТЕКСТ:
- Длина: ${context.metadata.textLength} символов
- Сложность: ${context.metadata.complexity}
- Язык: ${context.metadata.language}

ТВОЯ ЗАДАЧА:
1. Определи стратегию обучения (single_concept, multiple_concepts, step_by_step, comparison)
2. Реши какие агенты должны работать и как
3. Дай четкие инструкции каждому агенту
4. Определи ожидаемый результат

СТРАТЕГИИ:
- single_concept: один ключевой концепт
- multiple_concepts: несколько независимых концептов  
- step_by_step: пошаговый процесс или алгоритм
- comparison: сравнение или противопоставление

JSON ответ:
{
  "strategy": "step_by_step",
  "agents": ["contentAnalyzer", "cardGenerator", "questionQuality", "validator"],
  "instructions": {
    "contentAnalyzer": "Выдели основные шаги процесса и их последовательность",
    "cardGenerator": "Создай карточки для каждого шага с акцентом на практическое применение",
    "questionQuality": "Проверь что каждый вопрос помогает понять последовательность действий",
    "validator": "Убедись что карточки образуют логическую последовательность обучения"
  },
  "expectedOutput": "Набор карточек покрывающих пошаговый процесс",
  "reasoning": "Текст описывает процедуру, лучше изучать по шагам"
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.supervisor.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from supervisor agent');
            }

            return this.parseJSONResponse(response.content, 'supervisor');
        } catch (error) {
            console.error('Supervisor agent error:', error);
            return this.createFallbackSupervisorDecision();
        }
    }

    // Content Analyzer Agent - анализирует контент

    // Card Generator Agent - создает карточки по плану
    private async executeCardGenerator(input: any, context: WorkflowContext): Promise<GeneratedCard[]> {
        // Поддерживаем как новый, так и старый интерфейс
        const { text, cardPlan, textAnalysis, multimediaDistribution, analysis, instructions } = input;

        // Определяем используемый интерфейс
        const useNewInterface = cardPlan && textAnalysis;
        
        let prompt: string;
        
        if (useNewInterface) {
            prompt = `Ты - Card Generator Agent. Создай высококачественные образовательные карточки ТОЧНО по плану.

ТЕКСТ: "${text}"

АНАЛИЗ ТЕКСТА:
- Основные темы: ${textAnalysis.mainTopics.map((t: any) => t.name).join(', ')}
- Рекомендуемые карточки: ${textAnalysis.estimatedCards}
- Сложность: ${textAnalysis.complexity}
- Мультимедиа доступно: ${textAnalysis.hasMultimedia ? 'ДА' : 'НЕТ'}

ПЛАН КАРТОЧЕК (СЛЕДУЙ ТОЧНО):
${cardPlan.cardSpecs.map((spec: any, i: number) => `
Карточка ${i + 1} (${spec.id}):
- Тип: ${spec.type}
- Тема: ${spec.topic}
- Приоритет: ${spec.priority}
- Сложность: ${spec.difficulty}
- Описание: ${spec.description}
- Нужен мультимедиа: ${spec.needsMultimedia ? 'ДА' : 'НЕТ'}
`).join('')}

КРИТИЧЕСКИЕ ТРЕБОВАНИЯ К КАЧЕСТВУ:
1. НИКОГДА НЕ ДУБЛИРУЙ ключевые слова из вопроса в ответе
2. Вопросы должны проверять ПОНИМАНИЕ, не память
3. Ответы должны быть ИНФОРМАТИВНЫМИ и ОБУЧАЮЩИМИ
4. Добавляй КОНТЕКСТ и ОБЪЯСНЕНИЯ
5. Избегай ОЧЕВИДНЫХ вопросов

ПЛОХИЕ ПРИМЕРЫ (НЕ ДЕЛАЙ ТАК):
❌ "Что такое лев?" → "Лев - это лев"
❌ "Какой вид млекопитающих лев?" → "Лев - вид хищных млекопитающих"
❌ "Где живут львы?" → "Львы живут в Африке"

ХОРОШИЕ ПРИМЕРЫ:
✅ "Почему львы единственные социальные большие кошки?" → "Львы живут прайдами для совместной охоты на крупную добычу, защиты территории и воспитания потомства. Другие большие кошки (тигры, леопарды) - одиночки"
✅ "Какие адаптации помогают львам охотиться в группе?" → "Специализация ролей: самки-охотницы используют скрытность и координацию, самцы защищают прайд. Развитая коммуникация через рык и жесты"

ТВОЯ ЗАДАЧА:
1. Создай РОВНО ${cardPlan.totalCards} карточек по плану
2. Каждая карточка должна соответствовать своему CardSpec
3. НЕ добавляй мультимедиа сейчас - это будет сделано отдельно
4. Сосредоточься на качественном содержании
5. ПРОВЕРЬ каждую карточку на дублирование слов

JSON ответ:
{
  "cards": [
    {
      "front": "Вопрос для карточки 1 (БЕЗ дублирования ключевых слов из ответа)",
      "back": "Информативный ответ с контекстом и объяснениями",
      "tags": ["${textAnalysis.mainTopics[0]?.name || 'общее'}"],
      "difficulty": "medium",
      "concept": "${cardPlan.cardSpecs[0]?.topic || 'концепт'}"
    }
  ]
}`;
        } else {
            // Старый интерфейс для обратной совместимости
            prompt = `Ты - Card Generator Agent. Создай высококачественные образовательные карточки.

ТЕКСТ: "${text}"

АНАЛИЗ КОНТЕНТА:
- Тема: ${analysis?.mainTopic || 'Общая тема'}
- Ключевые понятия: ${analysis?.concepts?.map((c: ConceptInfo) => c.name).join(', ') || 'Основные концепты'}
- Цели обучения: ${analysis?.learningObjectives?.join(', ') || 'Изучение материала'}
- Сложность: ${analysis?.complexity || 'medium'}

ИНСТРУКЦИИ: ${instructions || 'Создай качественные образовательные карточки'}

КРИТИЧЕСКИЕ ТРЕБОВАНИЯ К КАЧЕСТВУ:
1. НИКОГДА НЕ ДУБЛИРУЙ ключевые слова из вопроса в ответе
2. Вопросы должны проверять ПОНИМАНИЕ, не память
3. Ответы должны быть ИНФОРМАТИВНЫМИ и ОБУЧАЮЩИМИ
4. Добавляй КОНТЕКСТ и ОБЪЯСНЕНИЯ
5. Избегай ОЧЕВИДНЫХ вопросов

ПЛОХИЕ ПРИМЕРЫ (НЕ ДЕЛАЙ ТАК):
❌ "Что такое HTML?" → "HTML - это HTML"
❌ "Какой язык программирования Python?" → "Python - язык программирования"
❌ "Где используется JavaScript?" → "JavaScript используется в веб-разработке"

ХОРОШИЕ ПРИМЕРЫ:
✅ "Почему Python считается подходящим для начинающих программистов?" → "Python имеет простой синтаксис, близкий к английскому языку, автоматическое управление памятью, богатую стандартную библиотеку и активное сообщество"
✅ "Какие преимущества дает использование JavaScript на сервере?" → "Node.js позволяет использовать один язык для фронтенда и бэкенда, имеет высокую производительность благодаря V8, большую экосистему npm пакетов"

ПРИНЦИПЫ КАЧЕСТВЕННЫХ КАРТОЧЕК:
1. Один вопрос - один концепт
2. Четкие, конкретные вопросы БЕЗ дублирования
3. Полные, точные ответы с контекстом
4. Практическая применимость
5. Прогрессивная сложность

JSON ответ:
{
  "cards": [
    {
      "front": "Четкий вопрос БЕЗ дублирования ключевых слов",
      "back": "Полный информативный ответ с объяснениями",
      "tags": ["тег1"],
      "difficulty": "medium",
      "concept": "Название концепта"
    }
  ]
}`;
        }

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.cardGenerator.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from card generator agent');
            }

            const result = this.parseJSONResponse(response.content, 'cardGenerator');
            return result.cards || [];
        } catch (error) {
            console.error('Card generator error:', error);
            return this.createFallbackCards(text);
        }
    }

    // Question Quality Agent - проверяет качество вопросов
    private async executeQuestionQuality(card: GeneratedCard, context: WorkflowContext): Promise<QuestionQuality> {
        const prompt = `Ты - Question Quality Agent. СТРОГО оцени качество образовательного вопроса.

КАРТОЧКА ДЛЯ АНАЛИЗА:
Вопрос: "${card.front}"
Ответ: "${card.back}"
Концепт: ${card.concept || 'не указан'}

ОРИГИНАЛЬНЫЙ ТЕКСТ: "${context.originalText.substring(0, 500)}..."

КРИТИЧЕСКИЙ АНАЛИЗ:
1. ПРОВЕРЬ НА ДУБЛИРОВАНИЕ:
   - Есть ли одинаковые ключевые слова в вопросе и ответе?
   - Повторяет ли ответ формулировку вопроса?

2. ПРОВЕРЬ ОБРАЗОВАТЕЛЬНУЮ ЦЕННОСТЬ:
   - Учит ли что-то новое?
   - Проверяет ли понимание, а не память?
   - Добавляет ли контекст и объяснения?

3. ПРОВЕРЬ КАЧЕСТВО ФОРМУЛИРОВКИ:
   - Ясен ли вопрос?
   - Полон ли ответ?
   - Есть ли конкретные детали?

ШКАЛА ОЦЕНКИ:
- 9-10: Отличная карточка, учит и проверяет понимание
- 7-8: Хорошая карточка с небольшими недостатками
- 5-6: Посредственная карточка, требует улучшений
- 3-4: Плохая карточка, серьезные проблемы
- 1-2: Очень плохая карточка, бесполезна

АВТОМАТИЧЕСКОЕ ОТКЛОНЕНИЕ (isWorthwhile: false) ЕСЛИ:
- Вопрос содержит те же ключевые слова что и ответ
- Ответ просто переформулирует вопрос
- Качество меньше 6 баллов
- Нет образовательной ценности

JSON ответ:
{
  "question": "${card.front}",
  "answer": "${card.back}",
  "qualityScore": 3,
  "relevanceScore": 4,
  "difficultyScore": 2,
  "issues": ["Дублирование ключевых слов", "Ответ повторяет вопрос", "Нет образовательной ценности"],
  "improvements": ["Переформулировать вопрос", "Добавить контекст в ответ", "Сделать вопрос более конкретным"],
  "isWorthwhile": false,
  "reasoning": "Карточка отклонена из-за дублирования: вопрос 'Какой вид хищных млекопитающих представляет собой лев?' и ответ 'Лев - вид хищных млекопитающих' содержат одинаковые слова. Нет образовательной ценности."
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.questionQuality.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from question quality agent');
            }

            return this.parseJSONResponse(response.content, 'questionQuality');
        } catch (error) {
            console.error('Question quality error:', error);
            return this.createFallbackQualityCheck(card);
        }
    }

    // Validator Agent - быстрая финальная проверка
    private async executeValidator(input: any, context: WorkflowContext): Promise<ValidationResult> {
        const { cards, originalText } = input;

        const prompt = `Ты - Validator Agent. Проведи БЫСТРУЮ финальную проверку карточек.

ОРИГИНАЛЬНЫЙ ТЕКСТ: "${originalText.substring(0, 300)}..."

КАРТОЧКИ (${cards.length} шт):
${cards.map((card: GeneratedCard, i: number) => `
${i + 1}. Q: ${card.front}
   A: ${card.back}
`).join('')}

БЫСТРАЯ ПРОВЕРКА:
1. Есть ли критические ошибки? (фактические, логические)
2. Понятны ли карточки?
3. Имеют ли образовательную ценность?

ПРАВИЛА:
- Если карточки приемлемы (70+) → не предлагай улучшений
- Только критические проблемы требуют исправления
- НЕ переписывай карточки без серьезной необходимости

JSON ответ:
{
  "isValid": true,
  "overallScore": 75,
  "cardScores": {0: 75, 1: 80},
  "issues": [],
  "suggestions": [],
  "improvedCards": null,
  "finalRecommendation": "Карточки приемлемого качества"
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.validator.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from validator agent');
            }

            return this.parseJSONResponse(response.content, 'validator');
        } catch (error) {
            console.error('Validator error:', error);
            return this.createFallbackValidation(cards);
        }
    }

    // Page Content Analyzer Agent - анализирует мультимедийный контент страницы
    private async executePageContentAnalyzer(input: any, context: WorkflowContext): Promise<ContentEnhancement> {
        const { text, pageContext } = input;

        const prompt = `Ты - Page Content Analyzer Agent. Проанализируй страницу и определи, какие элементы помогут в обучении.

ВЫДЕЛЕННЫЙ ТЕКСТ: "${text}"

КОНТЕНТ СТРАНИЦЫ:
Изображения (${pageContext.pageImages.length}):
${pageContext.pageImages.map((img: PageImage, i: number) => `${i + 1}. ${img.alt || 'Без описания'} (${img.isNearText ? 'рядом с текстом' : 'далеко от текста'})`).join('\n')}

Формулы (${pageContext.formulas.length}):
${pageContext.formulas.map((formula: FormulaElement, i: number) => `${i + 1}. ${formula.text} (${formula.type})`).join('\n')}

Код (${pageContext.codeBlocks.length}):
${pageContext.codeBlocks.map((code: CodeBlock, i: number) => `${i + 1}. ${code.language || 'unknown'}: ${code.code.substring(0, 100)}...`).join('\n')}

ТВОЯ ЗАДАЧА:
1. Определи, какие изображения релевантны для понимания текста
2. Определи, какие формулы важны для объяснения
3. Определи, какие блоки кода нужны для примеров
4. Обоснуй каждое решение

КРИТЕРИИ ОТБОРА:
- Изображения: диаграммы, схемы, иллюстрации концептов
- Формулы: математические выражения, связанные с текстом
- Код: примеры, алгоритмы, упомянутые в тексте

JSON ответ:
{
  "shouldIncludeImages": true,
  "selectedImages": [0, 2],
  "shouldIncludeFormulas": false,
  "selectedFormulas": [],
  "shouldIncludeCode": true,
  "selectedCode": [0],
  "reasoning": "Изображение 1 и 3 иллюстрируют основные концепты. Код показывает практическое применение."
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.pageContentAnalyzer.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from page content analyzer agent');
            }

            const result = this.parseJSONResponse(response.content, 'pageContentAnalyzer');
            
            // Преобразуем индексы в объекты
            const selectedImages = result.selectedImages?.map((index: number) => pageContext.pageImages[index]).filter(Boolean) || [];
            const selectedFormulas = result.selectedFormulas?.map((index: number) => pageContext.formulas[index]).filter(Boolean) || [];
            const selectedCode = result.selectedCode?.map((index: number) => pageContext.codeBlocks[index]).filter(Boolean) || [];

            return {
                shouldIncludeImages: result.shouldIncludeImages || false,
                selectedImages,
                shouldIncludeFormulas: result.shouldIncludeFormulas || false,
                selectedFormulas,
                shouldIncludeCode: result.shouldIncludeCode || false,
                selectedCode,
                reasoning: result.reasoning || 'No reasoning provided'
            };
        } catch (error) {
            console.error('Page content analyzer error:', error);
            return this.createFallbackContentEnhancement();
        }
    }

    // Content Enhancer Agent - интегрирует мультимедиа в карточки
    private async executeContentEnhancer(input: any, context: WorkflowContext): Promise<{ enhancedCards: GeneratedCard[] }> {
        const { cards, contentEnhancement, originalText, contentMatches } = input;

        // Используем результаты анализа соответствия если они есть
        const useMatching = contentMatches && contentMatches.cardMatches && contentMatches.cardMatches.length > 0;
        
        const prompt = `Ты - Content Enhancer Agent. Улучши карточки на основе ТОЧНОГО анализа соответствия контента.

${useMatching ? 'СПЕЦИАЛЬНЫЕ ИНСТРУКЦИИ: Используй ТОЧНЫЕ РЕЗУЛЬТАТЫ анализа соответствия - добавляй контент только к тем карточкам, где это прямо указано.' : 'ОБЩИЕ ИНСТРУКЦИИ: Анализируй каждую карточку индивидуально.'}

ОРИГИНАЛЬНЫЙ ТЕКСТ: "${originalText}"

КАРТОЧКИ (${cards.length}):
${cards.map((card: GeneratedCard, i: number) => `
Карточка ${i + 1}:
Вопрос: ${card.front}
Ответ: ${card.back}
Тема: ${this.extractCardTopic(card.front, card.back)}
${useMatching ? `Рекомендованный контент: ${this.getMatchedContentForCard(i, contentMatches)}` : ''}
`).join('')}

ДОСТУПНЫЙ КОНТЕНТ:
${contentEnhancement.shouldIncludeImages ? `Изображения (${contentEnhancement.selectedImages.length}):
${contentEnhancement.selectedImages.map((img: PageImage, i: number) => `${i + 1}. "${img.alt || 'без описания'}" (релевантность: ${img.relevanceScore}/10)`).join('\n')}` : 'Изображения: отсутствуют'}

${contentEnhancement.shouldIncludeFormulas ? `Формулы (${contentEnhancement.selectedFormulas.length}):
${contentEnhancement.selectedFormulas.map((formula: FormulaElement, i: number) => `${i + 1}. "${formula.text}" (релевантность: ${formula.relevanceScore}/10)`).join('\n')}` : 'Формулы: отсутствуют'}

${contentEnhancement.shouldIncludeCode ? `Код (${contentEnhancement.selectedCode.length}):
${contentEnhancement.selectedCode.map((code: CodeBlock, i: number) => `${i + 1}. ${code.language || 'text'}: "${code.code.substring(0, 60)}..." (релевантность: ${code.relevanceScore}/10)`).join('\n')}` : 'Код: отсутствует'}

${useMatching ? `
РЕЗУЛЬТАТЫ АНАЛИЗА СООТВЕТСТВИЯ:
${contentMatches.cardMatches.map((match: any) => `
Карточка ${match.cardIndex + 1}:
- Изображения: [${match.relevantImages.join(', ')}]
- Формулы: [${match.relevantFormulas.join(', ')}] 
- Код: [${match.relevantCode.join(', ')}]
- Обоснование: ${match.reasoning}
`).join('')}

СТРОГО СЛЕДУЙ РЕЗУЛЬТАТАМ АНАЛИЗА! Добавляй контент только к указанным карточкам.` : `
ПРАВИЛА САМОСТОЯТЕЛЬНОГО АНАЛИЗА:
1. Анализируй каждую карточку отдельно
2. Добавляй контент только при релевантности ≥8/10
3. Учитывай тематику: математика→формулы, код→программирование, процессы→схемы
4. НЕ добавляй контент "на всякий случай"`}

JSON ответ:
{
  "enhancedCards": [
    {
      "front": "Что такое фотосинтез?",
      "back": "Фотосинтез - это процесс преобразования углекислого газа и воды в глюкозу с помощью солнечного света.\n\n[IMAGE:0]\n\nХимическая формула: [FORMULA:0]",
      "multimedia": {
        "images": [0],
        "formulas": [0], 
        "code": []
      },
      "reasoning": "Добавил схему фотосинтеза и химическую формулу, так как они прямо иллюстрируют процесс"
    },
    {
      "front": "Какие факторы влияют на скорость фотосинтеза?",
      "back": "Температура, освещенность, концентрация CO2 и доступность воды влияют на скорость фотосинтеза.",
      "multimedia": {
        "images": [],
        "formulas": [],
        "code": []
      },
      "reasoning": "Эта карточка о факторах - не нужен мультимедиа контент, текст достаточно ясен"
    }
  ]
}

ВАЖНО: Используй плейсхолдеры [IMAGE:N], [FORMULA:N], [CODE:N] только когда контент ДЕЙСТВИТЕЛЬНО нужен для этой конкретной карточки.`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.contentEnhancer.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from content enhancer agent');
            }

            const result = this.parseJSONResponse(response.content, 'contentEnhancer');
            console.log('🎨 Content enhancer parsed result:', result);
            
            // Обрабатываем результат и заменяем плейсхолдеры на реальный контент
            const enhancedCards = result.enhancedCards?.map((card: any, cardIndex: number) => {
                let enhancedBack = card.back;
                
                console.log(`🔧 Обработка карточки ${cardIndex + 1}: ${card.front}`);
                console.log(`📋 Мультимедиа для карточки:`, card.multimedia);
                
                // Ищем и заменяем все плейсхолдеры изображений
                const imageMatches = enhancedBack.match(/\[IMAGE:(\d+)\]/g);
                if (imageMatches) {
                    console.log(`🔍 Найдены плейсхолдеры изображений в карточке ${cardIndex + 1}:`, imageMatches);
                    imageMatches.forEach((match: string) => {
                        const indexMatch = match.match(/\[IMAGE:(\d+)\]/);
                        if (indexMatch) {
                            const imageIndex = parseInt(indexMatch[1]);
                            const image = contentEnhancement.selectedImages[imageIndex];
                            console.log(`🔄 Замена ${match} на изображение ${imageIndex} в карточке ${cardIndex + 1}:`, image?.src || 'НЕ НАЙДЕНО');
                            if (image) {
                                // Используем base64 если доступно, иначе используем URL
                                const imageSrc = image.base64 || image.src;
                                console.log(`🖼️ Используем ${image.base64 ? 'base64' : 'URL'} для изображения в карточке ${cardIndex + 1}`);
                                
                                // Улучшенная логика для alt текста
                                const altText = image.alt && image.alt.trim() !== '' ? image.alt : '';
                                
                                // Улучшенное форматирование изображения с минимальными отступами
                                enhancedBack = enhancedBack.replace(
                                    match,
                                    `\n![${altText}](${imageSrc})\n`
                                );
                            } else {
                                console.warn(`⚠️ Изображение с индексом ${imageIndex} не найдено в selectedImages`);
                                // Удаляем некорректный плейсхолдер
                                enhancedBack = enhancedBack.replace(match, '');
                            }
                        }
                    });
                }
                
                // Ищем и заменяем все плейсхолдеры формул
                const formulaMatches = enhancedBack.match(/\[FORMULA:(\d+)\]/g);
                if (formulaMatches) {
                    console.log(`🔍 Найдены плейсхолдеры формул в карточке ${cardIndex + 1}:`, formulaMatches);
                    formulaMatches.forEach((match: string) => {
                        const indexMatch = match.match(/\[FORMULA:(\d+)\]/);
                        if (indexMatch) {
                            const formulaIndex = parseInt(indexMatch[1]);
                            const formula = contentEnhancement.selectedFormulas[formulaIndex];
                            console.log(`🔄 Замена ${match} на формулу ${formulaIndex} в карточке ${cardIndex + 1}:`, formula?.text || 'НЕ НАЙДЕНО');
                            if (formula) {
                                enhancedBack = enhancedBack.replace(
                                    match,
                                    `\n$$${formula.text}$$\n`
                                );
                            } else {
                                console.warn(`⚠️ Формула с индексом ${formulaIndex} не найдена в selectedFormulas`);
                                // Удаляем некорректный плейсхолдер
                                enhancedBack = enhancedBack.replace(match, '');
                            }
                        }
                    });
                }
                
                // Ищем и заменяем все плейсхолдеры кода
                const codeMatches = enhancedBack.match(/\[CODE:(\d+)\]/g);
                if (codeMatches) {
                    console.log(`🔍 Найдены плейсхолдеры кода в карточке ${cardIndex + 1}:`, codeMatches);
                    codeMatches.forEach((match: string) => {
                        const indexMatch = match.match(/\[CODE:(\d+)\]/);
                        if (indexMatch) {
                            const codeIndex = parseInt(indexMatch[1]);
                            const code = contentEnhancement.selectedCode[codeIndex];
                            console.log(`🔄 Замена ${match} на код ${codeIndex} в карточке ${cardIndex + 1}:`, code?.code?.substring(0, 30) || 'НЕ НАЙДЕНО');
                            if (code) {
                                enhancedBack = enhancedBack.replace(
                                    match,
                                    `\n\`\`\`${code.language || ''}\n${code.code}\n\`\`\`\n`
                                );
                            } else {
                                console.warn(`⚠️ Код с индексом ${codeIndex} не найден в selectedCode`);
                                // Удаляем некорректный плейсхолдер
                                enhancedBack = enhancedBack.replace(match, '');
                            }
                        }
                    });
                }
                
                // Очищаем лишние переносы строк
                enhancedBack = enhancedBack.replace(/\n{3,}/g, '\n\n');
                
                console.log(`✅ Карточка ${cardIndex + 1} обработана. Мультимедиа:`, {
                    images: card.multimedia?.images?.length || 0,
                    formulas: card.multimedia?.formulas?.length || 0,
                    code: card.multimedia?.code?.length || 0
                });
                
                return {
                    ...card,
                    back: enhancedBack,
                    multimedia: card.multimedia,
                    // Сохраняем только релевантные мультимедиа данные для этой карточки
                    attachedImages: card.multimedia?.images?.map((idx: number) => contentEnhancement.selectedImages[idx]).filter(Boolean) || [],
                    attachedFormulas: card.multimedia?.formulas?.map((idx: number) => contentEnhancement.selectedFormulas[idx]).filter(Boolean) || [],
                    attachedCode: card.multimedia?.code?.map((idx: number) => contentEnhancement.selectedCode[idx]).filter(Boolean) || []
                };
            }) || cards;

            console.log(`🎉 Content Enhancement завершен. Обработано ${enhancedCards.length} карточек`);
            return { enhancedCards };
        } catch (error) {
            console.error('Content enhancer error:', error);
            return { enhancedCards: cards };
        }
    }

    // Card Content Matcher Agent - точно определяет какой контент подходит к каждой карточке
    private async executeCardContentMatcher(input: any, context: WorkflowContext): Promise<any> {
        const { cards, contentEnhancement, originalText } = input;

        const prompt = `Ты - Card Content Matcher Agent. Проанализируй каждую карточку и точно определи, какой мультимедиа контент ей подходит.

ОРИГИНАЛЬНЫЙ ТЕКСТ: "${originalText}"

КАРТОЧКИ ДЛЯ АНАЛИЗА (${cards.length}):
${cards.map((card: GeneratedCard, i: number) => `
Карточка ${i + 1}:
Вопрос: ${card.front}
Ответ: ${card.back}
Тема: ${this.extractCardTopic(card.front, card.back)}
`).join('')}

ДОСТУПНЫЙ КОНТЕНТ:
${contentEnhancement.shouldIncludeImages ? `Изображения (${contentEnhancement.selectedImages.length}):
${contentEnhancement.selectedImages.map((img: PageImage, i: number) => `${i + 1}. Alt: "${img.alt || 'без описания'}" | Релевантность: ${img.relevanceScore}/10`).join('\n')}` : 'Изображения: отсутствуют'}

${contentEnhancement.shouldIncludeFormulas ? `Формулы (${contentEnhancement.selectedFormulas.length}):
${contentEnhancement.selectedFormulas.map((formula: FormulaElement, i: number) => `${i + 1}. "${formula.text}" | Релевантность: ${formula.relevanceScore}/10`).join('\n')}` : 'Формулы: отсутствуют'}

${contentEnhancement.shouldIncludeCode ? `Код (${contentEnhancement.selectedCode.length}):
${contentEnhancement.selectedCode.map((code: CodeBlock, i: number) => `${i + 1}. ${code.language || 'text'}: "${code.code.substring(0, 80)}..." | Релевантность: ${code.relevanceScore}/10`).join('\n')}` : 'Код: отсутствует'}

ПРАВИЛА АНАЛИЗА:
1. Для каждой карточки определи степень соответствия (0-10) каждого элемента контента
2. Элемент добавляется к карточке только при соответствии ≥ 8/10
3. Учитывай тематику: математика→формулы, программирование→код, процессы→схемы
4. НЕ добавляй контент если он не добавляет образовательной ценности
5. Приоритет: специфичность > общность

JSON ответ:
{
  "cardMatches": [
    {
      "cardIndex": 0,
      "relevantImages": [0],
      "relevantFormulas": [],
      "relevantCode": [],
      "reasoning": "Изображение 1 прямо иллюстрирует концепт из вопроса"
    },
    {
      "cardIndex": 1,
      "relevantImages": [],
      "relevantFormulas": [0],
      "relevantCode": [],
      "reasoning": "Формула 1 объясняет математическую зависимость из ответа"
    }
  ]
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.cardContentMatcher.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from card content matcher agent');
            }

            const result = this.parseJSONResponse(response.content, 'cardContentMatcher');
            console.log('🎯 Card content matcher result:', result);
            
            return result;
        } catch (error) {
            console.error('Card content matcher error:', error);
            return { cardMatches: [] };
        }
    }

    // Вспомогательный метод для извлечения темы карточки
    private extractCardTopic(front: string, back: string): string {
        // Простая эвристика для определения темы карточки
        const text = (front + ' ' + back).toLowerCase();
        
        if (text.includes('формула') || text.includes('уравнение') || text.includes('математ')) return 'математика';
        if (text.includes('код') || text.includes('программ') || text.includes('алгоритм')) return 'программирование';
        if (text.includes('схема') || text.includes('диаграмма') || text.includes('процесс')) return 'схематика';
        if (text.includes('история') || text.includes('дата') || text.includes('событие')) return 'история';
        if (text.includes('определение') || text.includes('понятие') || text.includes('термин')) return 'теория';
        
        return 'общая';
    }

    // Text Analyst Agent - глубокий анализ текста и планирование обучения
    private async executeTextAnalyst(input: any, context: WorkflowContext): Promise<TextAnalysis> {
        const { text, pageContext } = input;
        
        const hasImages = pageContext?.pageImages?.length > 0;
        const hasFormulas = pageContext?.formulas?.length > 0;
        const hasCode = pageContext?.codeBlocks?.length > 0;
        
        const prompt = `Ты - Text Analyst Agent. Проведи глубокий анализ текста и определи оптимальную стратегию обучения.

ТЕКСТ ДЛЯ АНАЛИЗА (${text.length} символов):
"${text}"

ДОСТУПНЫЙ МУЛЬТИМЕДИА КОНТЕНТ:
- Изображения: ${hasImages ? pageContext.pageImages.length : 0} ${hasImages ? '(ЕСТЬ - обязательно учти!)' : ''}
- Формулы: ${hasFormulas ? pageContext.formulas.length : 0}
- Код: ${hasCode ? pageContext.codeBlocks.length : 0}

ТВОЯ ЗАДАЧА:
1. Определи основные темы и их важность
2. Оцени сложность материала
3. ТОЧНО определи сколько карточек ДЕЙСТВИТЕЛЬНО нужно (не переборщи!)
4. Учти мультимедиа контент в планировании
5. Приоритизируй темы

ПРИНЦИПЫ:
- Большой текст ≠ много карточек
- Фокус на ключевых концептах для понимания
- Если есть изображения - они ДОЛЖНЫ быть использованы
- Качество > количество

JSON ответ:
{
  "textLength": ${text.length},
  "complexity": "medium",
  "mainTopics": [
    {
      "name": "Основная тема",
      "importance": "critical",
      "complexity": "medium",
      "estimatedCards": 2,
      "needsMultimedia": true,
      "multimediaTypes": ["images"],
      "subtopics": ["подтема1", "подтема2"]
    }
  ],
  "estimatedCards": 3,
  "learningObjectives": ["понять X", "запомнить Y"],
  "hasMultimedia": ${hasImages || hasFormulas || hasCode},
  "multimediaTypes": [${hasImages ? '"images"' : ''}${hasFormulas ? ', "formulas"' : ''}${hasCode ? ', "code"' : ''}],
  "priority": "high",
  "reasoning": "Объяснение стратегии"
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.textAnalyst.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from text analyst agent');
            }

            const result = this.parseJSONResponse(response.content, 'textAnalyst');
            console.log('📋 Text analysis result:', result);
            
            return result;
        } catch (error) {
            console.error('Text analyst error:', error);
            return {
                textLength: text.length,
                complexity: this.estimateComplexity(text),
                mainTopics: [{
                    name: 'Основная тема',
                    importance: 'important' as const,
                    complexity: 'medium' as const,
                    estimatedCards: Math.min(5, Math.ceil(text.length / 1000)),
                    needsMultimedia: hasImages || hasFormulas || hasCode,
                    multimediaTypes: [
                        ...(hasImages ? ['images'] : []),
                        ...(hasFormulas ? ['formulas'] : []),
                        ...(hasCode ? ['code'] : [])
                    ],
                    subtopics: []
                }],
                estimatedCards: Math.min(5, Math.ceil(text.length / 1000)),
                learningObjectives: ['Понимание основных концептов'],
                hasMultimedia: hasImages || hasFormulas || hasCode,
                multimediaTypes: [
                    ...(hasImages ? ['images'] : []),
                    ...(hasFormulas ? ['formulas'] : []),
                    ...(hasCode ? ['code'] : [])
                ],
                priority: 'medium' as const,
                reasoning: 'Fallback analysis due to error'
            };
        }
    }

    // Card Planner Agent - планирование структуры карточек
    private async executeCardPlanner(input: any, context: WorkflowContext): Promise<CardPlan> {
        const { textAnalysis, originalText, pageContext } = input;
        
        const prompt = `Ты - Card Planner Agent. Создай детальный план карточек на основе анализа текста.

АНАЛИЗ ТЕКСТА:
Основные темы: ${textAnalysis.mainTopics?.map((t: any) => `${t.name} (важность: ${t.importance})`).join(', ') || 'Основные темы'}
Рекомендуемое количество карточек: ${textAnalysis.estimatedCards}
Сложность: ${textAnalysis.complexity}
Есть мультимедиа: ${textAnalysis.hasMultimedia ? 'ДА' : 'НЕТ'}
Типы мультимедиа: ${textAnalysis.multimediaTypes?.join(', ') || 'нет типов'}

ДОСТУПНЫЙ КОНТЕНТ:
${pageContext?.pageImages?.length > 0 ? `- Изображения: ${pageContext.pageImages.length} (ПРИОРИТЕТ - пользователь выделил!)` : ''}
${pageContext?.formulas?.length > 0 ? `- Формулы: ${pageContext.formulas.length}` : ''}
${pageContext?.codeBlocks?.length > 0 ? `- Код: ${pageContext.codeBlocks.length}` : ''}

ТВОЯ ЗАДАЧА:
1. Создай точный план каждой карточки
2. Определи тип карточки (концепт, пример, формула, код)
3. Спланируй распределение мультимедиа
4. Оптимизируй для эффективного обучения
5. ОБЯЗАТЕЛЬНО включи изображения если они есть

ТИПЫ КАРТОЧЕК:
- concept: основные понятия (с изображениями/схемами)
- definition: определения терминов
- formula: формулы и уравнения (с формулами)
- code: примеры кода (с кодом)
- example: практические примеры
- application: применение знаний

JSON ответ:
{
  "totalCards": 3,
  "cardSpecs": [
    {
      "id": "card_1",
      "type": "concept",
      "topic": "Основное понятие",
      "priority": "high",
      "difficulty": "medium",
      "needsMultimedia": true,
      "multimediaTypes": ["images"],
      "estimatedLength": "medium",
      "description": "Карточка объясняет основной концепт с использованием схемы"
    }
  ],
  "multimediaDistribution": {
    "totalImages": ${pageContext?.pageImages?.length || 0},
    "totalFormulas": ${pageContext?.formulas?.length || 0},
    "totalCode": ${pageContext?.codeBlocks?.length || 0},
    "assignments": [],
    "userSelectedImages": [0, 1],
    "reasoning": "Распределение мультимедиа"
  },
  "learningFlow": ["card_1", "card_2", "card_3"],
  "reasoning": "Объяснение плана"
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.cardPlanner.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from card planner agent');
            }

            const result = this.parseJSONResponse(response.content, 'cardPlanner');
            console.log('📋 Card plan result:', result);
            
            return result;
        } catch (error) {
            console.error('Card planner error:', error);
            // Fallback plan
            const estimatedCards = Math.min(textAnalysis.estimatedCards, 5);
            return {
                totalCards: estimatedCards,
                                 cardSpecs: Array.from({ length: estimatedCards }, (_, i: number) => ({
                    id: `card_${i + 1}`,
                    type: 'concept' as const,
                    topic: `Тема ${i + 1}`,
                    priority: 'medium' as const,
                    difficulty: 'medium' as const,
                    needsMultimedia: textAnalysis.hasMultimedia,
                    multimediaTypes: textAnalysis.multimediaTypes || [],
                    estimatedLength: 'medium' as const,
                    description: `Карточка ${i + 1}`
                })),
                multimediaDistribution: {
                    totalImages: pageContext?.pageImages?.length || 0,
                    totalFormulas: pageContext?.formulas?.length || 0,
                    totalCode: pageContext?.codeBlocks?.length || 0,
                    assignments: [],
                    userSelectedImages: pageContext?.pageImages?.map((_: any, i: number) => i) || [],
                    reasoning: 'Fallback distribution'
                },
                                 learningFlow: Array.from({ length: estimatedCards }, (_: any, i: number) => `card_${i + 1}`),
                reasoning: 'Fallback plan due to error'
            };
        }
    }

    // Math Content Processor Agent - обработка математического контента
    private async executeMathContentProcessor(input: any, context: WorkflowContext): Promise<any> {
        const { text } = input;

        const prompt = `Ты - Math Content Processor Agent. Обработай математический контент в тексте.

ВХОДНОЙ ТЕКСТ:
"${text}"

ТВОЯ ЗАДАЧА:
1. Найди все математические формулы и выражения
2. Преобразуй их в правильный LaTeX формат
3. Создай чистый текст для других агентов (замени формулы на описания)
4. Создай текст с плейсхолдерами для последующего рендеринга

ПРИМЕРЫ ПРЕОБРАЗОВАНИЯ:
- "3/4" → "\\frac{3}{4}"
- "x^2 + y^2" → "x^{2} + y^{2}"
- "m_a^2 + m_b^2 + m_c^2" → "m_{a}^{2} + m_{b}^{2} + m_{c}^{2}"
- "(3/4) S" → "\\frac{3}{4} S"
- "∑(x_i)" → "\\sum(x_{i})"
- "√(a² + b²)" → "\\sqrt{a^{2} + b^{2}}"
- "a^2 + b^2 + c^2" → "a^{2} + b^{2} + c^{2}"

JSON ОТВЕТ:
{
  "cleanText": "Сумма квадратов медиан произвольного треугольника составляет три четверти от суммы квадратов его сторон",
  "formulas": [
    {
      "original": "m_a^2 + m_b^2 + m_c^2 = (3/4) S",
      "latex": "m_{a}^{2} + m_{b}^{2} + m_{c}^{2} = \\frac{3}{4} S",
      "type": "block",
      "context": "основная формула теоремы о медианах треугольника"
    }
  ],
  "processedContent": "Сумма квадратов медиан произвольного треугольника составляет [FORMULA:0] от суммы квадратов его сторон"
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.mathContentProcessor.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from math content processor agent');
            }

            const result = this.parseJSONResponse(response.content, 'mathContentProcessor');
            console.log('🔢 Math content processor result:', result);

            return result;
        } catch (error) {
            console.error('Math content processor error:', error);
            // Fallback - возвращаем оригинальный текст без обработки
            return {
                cleanText: text,
                formulas: [],
                processedContent: text
            };
        }
    }

    // Formula Enhancer Agent - интеграция формул в карточки
    private async executeFormulaEnhancer(input: any, context: WorkflowContext): Promise<any> {
        const { cards, mathContent, originalText } = input;

        const prompt = `Ты - Formula Enhancer Agent. Интегрируй математические формулы в карточки.

МАТЕМАТИЧЕСКИЙ КОНТЕНТ:
${mathContent ? `Чистый текст: "${mathContent.cleanText}"
Формулы: ${JSON.stringify(mathContent.formulas, null, 2)}` : 'Математического контента нет'}

КАРТОЧКИ ДЛЯ ОБРАБОТКИ:
${cards.map((card: GeneratedCard, i: number) => `
Карточка ${i + 1}:
Вопрос: ${card.front}
Ответ: ${card.back}
`).join('')}

ТВОЯ ЗАДАЧА:
1. Определи, какие формулы нужны для каждой карточки
2. Вставь СПЕЦИАЛЬНУЮ МАРКИРОВКУ формул в правильные места
3. Обеспечь логичное и красивое отображение формул
4. НЕ добавляй формулы, если они не нужны

СТРОГИЕ ПРАВИЛА:
- Добавляй формулу ТОЛЬКО если она напрямую относится к карточке
- НЕ добавляй формулы "на всякий случай"
- Одна формула на карточку максимум (если вообще нужна)
- Формула должна помогать пониманию, а не загромождать
- Если в ответе уже есть текстовая формула - НЕ добавляй LaTeX версию

ПРАВИЛА СПЕЦИАЛЬНОЙ МАРКИРОВКИ:
- Основные формулы: [MATH:формула][/MATH]
- Промежуточные вычисления: [MATH:inline:выражение][/MATH]
- Примеры: [MATH:example:пример][/MATH]

ПРАВИЛА РАЗМЕЩЕНИЯ:
- Основные формулы: в начале объяснения
- Промежуточные вычисления: в середине текста
- Итоговые результаты: в конце ответа

ПЛОХИЕ ПРИМЕРЫ (НЕ ДЕЛАТЬ):
❌ Добавление формулы к каждой карточке
❌ Дублирование текстовой формулы LaTeX версией
❌ Добавление нерелевантных формул

ХОРОШИЕ ПРИМЕРЫ:
✅ "Сумма квадратов медиан равна [MATH:основная_формула][/MATH]" (если формула действительно нужна)
✅ Оставить карточку без формулы, если текст достаточно понятен

JSON ОТВЕТ:
{
  "enhancedCards": [
    {
      "front": "Вопрос карточки",
      "back": "Ответ с [MATH:основная_формула][/MATH] в нужном месте (только если формула действительно нужна)",
      "formulasUsed": [0],
      "reasoning": "Добавил формулу только потому что она существенно помогает пониманию"
    }
  ]
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.formulaEnhancer.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from formula enhancer agent');
            }

            const result = this.parseJSONResponse(response.content, 'formulaEnhancer');
            console.log('📐 Formula enhancer result:', result);

            return result;
        } catch (error) {
            console.error('Formula enhancer error:', error);
            return { enhancedCards: cards };
        }
    }

    // Multimedia Assigner Agent - распределение мультимедиа контента
    private async executeMultimediaAssigner(input: any, context: WorkflowContext): Promise<MultimediaDistribution> {
        const { cardPlan, pageContext, originalText } = input;
        
        const prompt = `Ты - Multimedia Assigner Agent. Точно распредели мультимедиа контент по карточкам.

ПЛАН КАРТОЧЕК:
${cardPlan.cardSpecs.map((spec: any, i: number) => `
Карточка ${i + 1} (${spec.id}):
- Тип: ${spec.type}
- Тема: ${spec.topic}
- Нужен мультимедиа: ${spec.needsMultimedia ? 'ДА' : 'НЕТ'}
- Типы: ${spec.multimediaTypes?.join(', ') || 'нет типов'}
- Описание: ${spec.description}
`).join('')}

ДОСТУПНЫЙ МУЛЬТИМЕДИА:
${pageContext?.pageImages?.length > 0 ? `
ИЗОБРАЖЕНИЯ (${pageContext.pageImages.length}) - ПРИОРИТЕТ:
${pageContext.pageImages.map((img: any, i: number) => `${i}. "${img.alt || 'без описания'}" (релевантность: ${img.relevanceScore}/10)`).join('\n')}
` : 'Изображения: нет'}

${pageContext?.formulas?.length > 0 ? `
ФОРМУЛЫ (${pageContext.formulas.length}):
${pageContext.formulas.map((formula: any, i: number) => `${i}. "${formula.text}" (тип: ${formula.type})`).join('\n')}
` : 'Формулы: нет'}

${pageContext?.codeBlocks?.length > 0 ? `
КОД (${pageContext.codeBlocks.length}):
${pageContext.codeBlocks.map((code: any, i: number) => `${i}. ${code.language || 'text'}: "${code.code.substring(0, 60)}..."`).join('\n')}
` : 'Код: нет'}

ОСОБЫЕ ТРЕБОВАНИЯ:
- Если пользователь выделил изображение - оно ДОЛЖНО попасть в карточку
- Каждое изображение должно иметь четкую образовательную цель
- Распределяй контент только при высокой релевантности (≥8/10)
- Один элемент мультимедиа может использоваться в нескольких карточках если это оправдано

JSON ответ:
{
  "totalImages": ${pageContext?.pageImages?.length || 0},
  "totalFormulas": ${pageContext?.formulas?.length || 0},
  "totalCode": ${pageContext?.codeBlocks?.length || 0},
  "assignments": [
    {
      "cardId": "card_1",
      "imageIndices": [0],
      "formulaIndices": [],
      "codeIndices": [],
      "reasoning": "Изображение 0 прямо иллюстрирует концепт карточки"
    }
  ],
  "userSelectedImages": [${pageContext?.pageImages?.map((_: unknown, i: number) => i).join(', ') || ''}],
  "reasoning": "Объяснение распределения"
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.multimediaAssigner.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from multimedia assigner agent');
            }

            const result = this.parseJSONResponse(response.content, 'multimediaAssigner');
            console.log('🎯 Multimedia assignment result:', result);
            
            return result;
        } catch (error) {
            console.error('Multimedia assigner error:', error);
            // Fallback assignment - assign all images to first cards
            const assignments: MultimediaAssignment[] = [];
            const imageCount = pageContext?.pageImages?.length || 0;
            const formulaCount = pageContext?.formulas?.length || 0;
            const codeCount = pageContext?.codeBlocks?.length || 0;
            
            cardPlan.cardSpecs.forEach((spec: any, i: number) => {
                const assignment: MultimediaAssignment = {
                    cardId: spec.id,
                    imageIndices: [],
                    formulaIndices: [],
                    codeIndices: [],
                    reasoning: 'Fallback assignment'
                };
                
                // Distribute images evenly, prioritizing first cards
                if (spec.needsMultimedia && Array.isArray(spec.multimediaTypes) && spec.multimediaTypes.includes('images') && imageCount > 0) {
                    const imagesPerCard = Math.ceil(imageCount / cardPlan.cardSpecs.length);
                    const startIdx = i * imagesPerCard;
                    const endIdx = Math.min(startIdx + imagesPerCard, imageCount);
                    assignment.imageIndices = Array.from({ length: endIdx - startIdx }, (_, j) => startIdx + j);
                }
                
                assignments.push(assignment);
            });
            
            return {
                totalImages: imageCount,
                totalFormulas: formulaCount,
                totalCode: codeCount,
                assignments,
                                 userSelectedImages: Array.from({ length: imageCount }, (_: unknown, i: number) => i),
                reasoning: 'Fallback distribution due to error'
            };
        }
    }

    // Вспомогательный метод для получения рекомендованного контента для карточки
    private getMatchedContentForCard(cardIndex: number, contentMatches: any): string {
        if (!contentMatches || !contentMatches.cardMatches) return 'нет рекомендаций';
        
        const match = contentMatches.cardMatches.find((m: any) => m.cardIndex === cardIndex);
        if (!match) return 'нет соответствий';
        
        const parts = [];
        if (match.relevantImages && Array.isArray(match.relevantImages) && match.relevantImages.length > 0) {
            parts.push(`изображения [${match.relevantImages.join(', ')}]`);
        }
        if (match.relevantFormulas && Array.isArray(match.relevantFormulas) && match.relevantFormulas.length > 0) {
            parts.push(`формулы [${match.relevantFormulas.join(', ')}]`);
        }
        if (match.relevantCode && Array.isArray(match.relevantCode) && match.relevantCode.length > 0) {
            parts.push(`код [${match.relevantCode.join(', ')}]`);
        }
        
        return parts.length > 0 ? parts.join(', ') : 'нет подходящего контента';
    }

    // Вспомогательные методы
    private detectLanguage(text: string): string {
        const russianPattern = /[а-яё]/i;
        return russianPattern.test(text) ? 'russian' : 'english';
    }

    private estimateComplexity(text: string): 'simple' | 'medium' | 'advanced' {
        const words = text.split(/\s+/).length;
        const sentences = text.split(/[.!?]+/).length;
        const avgWordsPerSentence = words / sentences;

        if (avgWordsPerSentence < 10 && words < 100) return 'simple';
        if (avgWordsPerSentence < 20 && words < 500) return 'medium';
        return 'advanced';
    }

    private parseJSONResponse(content: string, agentName: string): any {
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error(`No JSON found in ${agentName} response`);
            }
            return JSON.parse(jsonMatch[0]);
        } catch (error) {
            console.error(`Error parsing ${agentName} response:`, error);
            throw error;
        }
    }

    // Fallback методы
    private createFallbackSupervisorDecision(): SupervisorDecision {
        return {
            strategy: 'multiple_concepts',
            agents: ['contentAnalyzer', 'cardGenerator', 'questionQuality', 'validator'],
            instructions: {
                contentAnalyzer: 'Проанализируй ключевые понятия в тексте',
                cardGenerator: 'Создай карточки для основных понятий',
                questionQuality: 'Проверь качество каждого вопроса',
                validator: 'Проведи финальную проверку'
            },
            expectedOutput: 'Набор качественных карточек',
            reasoning: 'Fallback strategy - general approach'
        };
    }

    private createFallbackContentAnalysis(text: string): ContentAnalysis {
        return {
            mainTopic: 'Анализ контента',
            keyPoints: [text.substring(0, 100)],
            concepts: [{
                name: 'Основной концепт',
                definition: text.substring(0, 200),
                importance: 'medium',
                prerequisites: [],
                examples: []
            }],
            relationships: [],
            learningObjectives: ['Понять основную идею'],
            complexity: 'medium',
            estimatedCards: 2
        };
    }

    private createFallbackCards(text: string): GeneratedCard[] {
        return [{
            front: 'What is discussed in this text?',
            back: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
            difficulty: 'medium',
            concept: 'Main idea'
        }];
    }

    private createFallbackQualityCheck(card: GeneratedCard): QuestionQuality {
        return {
            question: card.front,
            answer: card.back,
            qualityScore: 7,
            relevanceScore: 7,
            difficultyScore: 7,
            issues: [],
            improvements: [],
            isWorthwhile: true,
            reasoning: 'Fallback quality check - acceptable card'
        };
    }

    private createFallbackValidation(cards: GeneratedCard[]): ValidationResult {
        return {
            isValid: true,
            overallScore: 75,
            cardScores: cards.reduce((acc, _, i) => ({ ...acc, [i]: 75 }), {}),
            issues: [],
            suggestions: [],
            finalRecommendation: 'Cards passed basic validation'
        };
    }

    private createFallbackContentEnhancement(): ContentEnhancement {
        return {
            shouldIncludeImages: false,
            selectedImages: [],
            shouldIncludeFormulas: false,
            selectedFormulas: [],
            shouldIncludeCode: false,
            selectedCode: [],
            reasoning: 'Fallback - no multimedia content analysis'
        };
    }

    // Обработка LaTeX формул в карточках с помощью KaTeX
    private async processLatexInCards(cards: GeneratedCard[]): Promise<GeneratedCard[]> {
        // Импортируем KaTeX рендерер динамически
        const { processLatexInContentAsync, processLatexInContent } = await import('../utils/katexRenderer');

        const processedCards = await Promise.all(
            cards.map(async (card) => {
                try {
                    let processedBack = card.back;

                    // Сначала обрабатываем специальные маркеры [MATH:...][/MATH]
                    processedBack = this.processMathMarkers(processedBack);

                    // Затем обрабатываем стандартные LaTeX формулы
                    processedBack = await processLatexInContentAsync(processedBack);

                    // Если результат содержит красный fallback (ошибка KaTeX), используем синхронную версию
                    if (processedBack.includes('background: #FEF2F2') || processedBack.includes('color: #DC2626')) {
                        console.log('⚠️ KaTeX failed, using sync fallback for card');
                        processedBack = processLatexInContent(card.back);
                        processedBack = this.processMathMarkers(processedBack);
                        processedBack = processLatexInContent(processedBack);
                    }

                    console.log('🎨 LaTeX processed for card:', card.front.substring(0, 30) + '...');
                    return {
                        ...card,
                        back: processedBack
                    };
                } catch (error) {
                    console.warn('LaTeX processing error for card:', error);
                    // В случае ошибки используем синхронную версию
                    try {
                        let processedBack = card.back;
                        processedBack = this.processMathMarkers(processedBack);
                        processedBack = processLatexInContent(processedBack);
                        return {
                            ...card,
                            back: processedBack
                        };
                    } catch (syncError) {
                        console.warn('Even sync LaTeX processing failed:', syncError);
                        return card; // Возвращаем оригинальную карточку
                    }
                }
            })
        );

        return processedCards;
    }

    // Обработка специальных маркеров [MATH:...][/MATH]
    private processMathMarkers(text: string): string {
        let processedText = text;

        // Удаляем экранированные переводы строк из JSON (\\n -> \n)
        processedText = processedText.replace(/\\n/g, '\n');

        // Блочные маркеры: допускаем вложенные скобки и пробелы
        processedText = processedText.replace(/\[MATH\s*:\s*([\s\S]*?)\s*\]\s*\[\/MATH\]/gi, (match, inner) => {
            const latexFormula = this.convertMathDescriptionToLatex(inner);
            return `$$${latexFormula}$$`;
        });

        // Inline маркеры
        processedText = processedText.replace(/\[MATH\s*:\s*inline\s*:\s*([\s\S]*?)\s*\]\s*\[\/MATH\]/gi, (match, inner) => {
            const latexFormula = this.convertMathDescriptionToLatex(inner);
            return `$${latexFormula}$`;
        });

        // Пример (рамка)
        processedText = processedText.replace(/\[MATH\s*:\s*example\s*:\s*([\s\S]*?)\s*\]\s*\[\/MATH\]/gi, (match, inner) => {
            const latexFormula = this.convertMathDescriptionToLatex(inner);
            return `<div style="border: 2px solid #3B82F6; border-radius: 8px; padding: 12px; margin: 8px 0; background: #F0F9FF;">$$${latexFormula}$$</div>`;
        });

        return processedText;
    }

    // Преобразование описания формулы в LaTeX
    private convertMathDescriptionToLatex(description: string): string {
        // Базовые преобразования распространенных описаний
        const conversions: { [key: string]: string } = {
            // Основные формулы
            'основная_формула': 'm_{a}^{2} + m_{b}^{2} + m_{c}^{2} = \\frac{3}{4} S',
            'm_a^2 + m_b^2 + m_c^2 = 3/4 S': 'm_{a}^{2} + m_{b}^{2} + m_{c}^{2} = \\frac{3}{4} S',
            'теорема_о_медианах': 'm_{a}^{2} + m_{b}^{2} + m_{c}^{2} = \\frac{3}{4} S',

            // Части формулы
            'сумма_квадратов_медиан': 'm_{a}^{2} + m_{b}^{2} + m_{c}^{2}',
            'левая_часть': 'm_{a}^{2} + m_{b}^{2} + m_{c}^{2}',
            'правая_часть': '\\frac{3}{4} S',

            // Числовые значения
            '3/4': '\\frac{3}{4}',
            'три_четвертых': '\\frac{3}{4}',
            'одна_четвертая': '\\frac{1}{4}',
            'две_трети': '\\frac{2}{3}',

            // Переменные
            'm_a^2': 'm_{a}^{2}',
            'm_b^2': 'm_{b}^{2}',
            'm_c^2': 'm_{c}^{2}',
            'медиана_a': 'm_{a}',
            'медиана_b': 'm_{b}',
            'медиана_c': 'm_{c}',

            // Общие математические обозначения
            'квадрат_стороны_a': 'a^{2}',
            'квадрат_стороны_b': 'b^{2}',
            'квадрат_стороны_c': 'c^{2}',
            'сумма_сторон': 'a + b + c',
            'площадь_треугольника': 'S',
        };

        // Если точное совпадение найдено
        if (conversions[description]) {
            return conversions[description];
        }

        // Обработка описаний с пробелами и подчеркиваниями
        const normalizedDesc = description.replace(/\s+/g, '_').toLowerCase();
        if (conversions[normalizedDesc]) {
            return conversions[normalizedDesc];
        }

        // Если описание уже содержит LaTeX
        if (description.includes('\\') || description.includes('_') || description.includes('^')) {
            return description;
        }

        // Попытка автоматического преобразования простых выражений
        const autoConverted = this.autoConvertToLatex(description);
        if (autoConverted !== description) {
            return autoConverted;
        }

        // Для неизвестных описаний возвращаем как есть
        console.log(`⚠️ Unknown math description: ${description}`);
        return description;
    }

    // Автоматическое преобразование простых выражений в LaTeX
    private autoConvertToLatex(expression: string): string {
        let result = expression;

        // Преобразование степеней: x^2 → x^{2}
        result = result.replace(/(\w+)\^(\w+)/g, '$1^{$2}');

        // Преобразование индексов: m_a → m_{a}
        result = result.replace(/(\w+)_([a-zA-Z])/g, '$1_{$2}');

        // Преобразование дробей: 3/4 → \frac{3}{4}
        result = result.replace(/(\d+)\/(\d+)/g, '\\frac{$1}{$2}');

        // Преобразование операторов
        result = result.replace(/\+/g, ' + ');
        result = result.replace(/-/g, ' - ');
        result = result.replace(/\*/g, ' \\cdot ');
        result = result.replace(/×/g, ' \\times ');
        result = result.replace(/÷/g, ' \\div ');

        // Вертикальная черта как условное разделение в формулах
        result = result.replace(/\|/g, ' \\mid ');

        return result;
    }

    // НОВАЯ АРХИТЕКТУРА: Новые методы для многоагентной системы

    // Анализ контента и планирование вопросов
    private async executeContentAnalyzer(text: string, context: WorkflowContext): Promise<ContentAnalysis> {
        const prompt = `Ты - Content Analyzer Agent. Проанализируй выделенный текст и составь план вопросов.

ВЫДЕЛЕННЫЙ ТЕКСТ:
"${text}"

ТВОЯ ЗАДАЧА:
1. Определить сколько карточек нужно создать (1-5)
2. Разделить текст на логические части
3. Для каждой части составить конкретный вопрос
4. Убедиться что вопросы основаны ТОЛЬКО на содержании текста

ПРАВИЛА:
- Минимум 1 карточка, максимум 5
- Вопросы должны проверять понимание, не память
- Каждый вопрос связан с конкретной частью текста

JSON ОТВЕТ:
{
  "questions": [
    {
      "question": "Конкретный вопрос по тексту",
      "textChunk": "Соответствующий кусок текста",
      "priority": "high|medium|low"
    }
  ],
  "analysis": {
    "totalCards": 3,
    "mainTopics": ["тема1", "тема2"],
    "complexity": "medium"
  }
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.contentAnalyzer.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from content analyzer');
            }

            const result = this.parseJSONResponse(response.content, 'contentAnalyzer');
            console.log('🧠 Content analysis result:', result);

            return result;
        } catch (error) {
            console.error('Content analyzer error:', error);
            // Fallback
            return {
                mainTopic: "Анализ выделенного текста",
                keyPoints: [text.substring(0, 100)],
                concepts: [],
                relationships: [],
                learningObjectives: ["Понять основное содержание текста"],
                complexity: "medium" as const,
                estimatedCards: 1,
                questions: [{
                    question: "Что является основным содержанием этого текста?",
                    textChunk: text,
                    priority: "high" as const
                }],
                analysis: {
                    totalCards: 1,
                    mainTopics: ["общее"],
                    complexity: "medium"
                }
            };
        }
    }

    // Параллельная генерация карточек
    private async executeParallelCardGeneration(analysisPlan: ContentAnalysis, context: WorkflowContext, abortSignal?: AbortSignal): Promise<GeneratedCard[]> {
        const { questions } = analysisPlan;

        if (!questions || questions.length === 0) {
            throw new Error('Нет вопросов для генерации карточек');
        }

        console.log(`🔄 Generating ${questions.length} cards in parallel...`);

        // Создаем промисы для параллельной генерации
        const cardPromises = questions.map(async (questionItem: any, index: number) => {
            if (abortSignal?.aborted) {
                throw new Error('Generation cancelled');
            }

            try {
                return await this.generateSingleCard(questionItem, context, index);
            } catch (error) {
                console.warn(`Failed to generate card ${index + 1}:`, error);
                return null;
            }
        });

        // Ждем завершения всех промисов
        const cardResults = await Promise.all(cardPromises);

        // Фильтруем успешные результаты
        const successfulCards = cardResults.filter(card => card !== null) as GeneratedCard[];

        console.log(`✅ Generated ${successfulCards.length}/${questions.length} cards successfully`);
        return successfulCards;
    }

    // Генерация одной карточки
    private async generateSingleCard(questionItem: any, context: WorkflowContext, index: number): Promise<GeneratedCard | null> {
        const { question, textChunk } = questionItem;

        const prompt = `Ты - Card Generator Agent. Создай качественную карточку.

ВОПРОС: ${question}
ТЕКСТ ДЛЯ ОТВЕТА: ${textChunk}

ПРАВИЛА:
1. Использовать ТОЛЬКО предоставленный текст
2. Создать полный и понятный ответ
3. Если есть формулы - отметить их маркерами [MATH:...][/MATH]
4. Сделать ответ информативным

JSON ОТВЕТ:
{
  "front": "${question}",
  "back": "Полный ответ на основе текста",
  "difficulty": "medium"
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.cardGenerator.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                return null;
            }

            const result = this.parseJSONResponse(response.content, 'cardGenerator');

            return {
                front: result.front || question,
                back: result.back || 'Ответ не сгенерирован',
                difficulty: result.difficulty || 'medium',
                concept: `Вопрос ${index + 1}`,
                tags: ['generated']
            };
        } catch (error) {
            console.warn('Single card generation error:', error);
            return null;
        }
    }

    // Проверка качества карточек
    private async executeQualityValidation(cards: GeneratedCard[], context: WorkflowContext, abortSignal?: AbortSignal): Promise<GeneratedCard[]> {
        console.log(`✅ Validating ${cards.length} cards...`);

        if (cards.length === 0) {
            return cards;
        }

        const validationResults = await Promise.all(cards.map(async (card) => {
            if (abortSignal?.aborted) {
                return { card, isValid: false, aborted: true } as const;
            }

            try {
                const isValid = await this.validateSingleCard(card, context);
                if (!isValid) {
                    console.log(`❌ Card rejected: ${card.front.substring(0, 50)}...`);
                }
                return { card, isValid, aborted: false } as const;
            } catch (error) {
                console.warn('Card validation error:', error);
                return { card, isValid: false, aborted: false } as const;
            }
        }));

        if (abortSignal?.aborted) {
            console.log('⏹️ Validation aborted - returning original cards');
            return cards;
        }

        const validatedCards = validationResults
            .filter(result => result.isValid)
            .map(result => result.card);

        console.log(`✅ Validation complete: ${validatedCards.length}/${cards.length} cards passed`);
        return validatedCards.length > 0 ? validatedCards : cards; // Fallback
    }

    // Проверка одной карточки
    private async validateSingleCard(card: GeneratedCard, context: WorkflowContext): Promise<boolean> {
        const prompt = `Ты - Quality Validator Agent. Проверь качество карточки.

КАРТОЧКА:
Вопрос: ${card.front}
Ответ: ${card.back}

КРИТЕРИИ ПРОВЕРКИ:
1. Соответствует ли ответ вопросу?
2. Есть ли образовательная ценность?
3. Нет ли дублирования ключевых слов?
4. Есть ли математические формулы (если применимо)?

Оцени по шкале 1-10 и верни true если >=7.

JSON ОТВЕТ:
{
  "score": 8,
  "isValid": true,
  "issues": [],
  "hasMath": false
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.qualityValidator.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                return false;
            }

            const result = this.parseJSONResponse(response.content, 'qualityValidator');
            return result.isValid === true;
        } catch (error) {
            console.warn('Quality validation error:', error);
            return true; // В случае ошибки пропускаем валидацию
        }
    }

    // Обработка математических формул
    private async executeMathFormatting(cards: GeneratedCard[], context: WorkflowContext, abortSignal?: AbortSignal): Promise<GeneratedCard[]> {
        console.log(`📐 Processing math in ${cards.length} cards...`);

        if (cards.length === 0) {
            return cards;
        }

        const formattingResults = await Promise.all(cards.map(async (card) => {
            if (abortSignal?.aborted) {
                return { original: card, processed: card, aborted: true } as const;
            }

            const hasMathMarkers = /\[MATH:[^\]]+\]\[\/MATH\]/g.test(card.back);

            if (!hasMathMarkers) {
                return { original: card, processed: card, aborted: false } as const;
            }

            try {
                const processedCard = await this.formatMathInCard(card, context);
                return { original: card, processed: processedCard, aborted: false } as const;
            } catch (error) {
                console.warn('Math formatting error:', error);
                return { original: card, processed: card, aborted: false } as const;
            }
        }));

        if (abortSignal?.aborted) {
            console.log('⏹️ Math formatting aborted - returning original cards');
            return cards;
        }

        const processedCards = formattingResults.map(result => result.processed);

        console.log(`📐 Math processing complete: ${processedCards.length} cards`);
        return processedCards;
    }

    // Форматирование математики в одной карточке
    private async formatMathInCard(card: GeneratedCard, context: WorkflowContext): Promise<GeneratedCard> {
        const prompt = `Ты - Math Formatter Agent. Отформатируй математические формулы.

КАРТОЧКА:
Вопрос: ${card.front}
Ответ: ${card.back}

ТВОЯ ЗАДАЧА:
1. Найти маркеры [MATH:...][/MATH]
2. Преобразовать их в правильный LaTeX
3. Использовать подходящие типы формул ($$...$$ для блочных, $...$ для inline)

ПРАВИЛА:
- Основные формулы: $$формула$$
- Inline выражения: $выражение$
- Примеры: добавить рамку если нужно

JSON ОТВЕТ:
{
  "formattedBack": "Ответ с отформатированными формулами"
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.mathFormatter.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                return card;
            }

            const result = this.parseJSONResponse(response.content, 'mathFormatter');

            return {
                ...card,
                back: result.formattedBack || card.back
            };
        } catch (error) {
            console.warn('Math formatter error:', error);
            return card;
        }
    }

    // Финальная обработка мультимедиа и форматирования
    private async applyMultimediaAndFormatting(cards: GeneratedCard[], pageContext?: PageContentContext, context?: WorkflowContext, abortSignal?: AbortSignal): Promise<GeneratedCard[]> {
        let finalCards = [...cards];

        // Применяем мультимедиа
        if (pageContext && pageContext.pageImages && pageContext.pageImages.length > 0) {
            console.log('🎨 Applying multimedia...');
            finalCards = this.applyMultimediaFast(finalCards, pageContext);
        }

        // Обрабатываем LaTeX формулы через KaTeX
        if (!abortSignal?.aborted) {
            console.log('🎨 Processing LaTeX formulas...');
            finalCards = await this.processLatexInCards(finalCards);
        }

        return finalCards;
    }

    // Fallback метод для старой архитектуры
    private async createCardsFromTextFallback(text: string, pageContext?: PageContentContext, context?: WorkflowContext, abortSignal?: AbortSignal): Promise<StoredCard[]> {
        console.log('⚠️ Using fallback method...');

        // Используем старую систему executeFastCombinedProcess
        const combinedResult = await this.executeFastCombinedProcess(text, pageContext, context || {
            originalText: text,
            currentStep: 'fallback',
            previousResults: {},
            metadata: {
                textLength: text.length,
                language: this.detectLanguage(text),
                topic: '',
                complexity: this.estimateComplexity(text)
            }
        }, abortSignal);

        let finalCards = combinedResult.cards;

        // Применяем финальную обработку
        finalCards = await this.applyMultimediaAndFormatting(finalCards, pageContext, context, abortSignal);

        return this.convertToStoredCards(finalCards, text);
    }

    // Конвертация в StoredCard
    private convertToStoredCards(cards: GeneratedCard[], originalText: string): StoredCard[] {
        return cards.map((card, index) => {
            const baseCard: any = {
                id: `ai_agent_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
                mode: Modes.GeneralTopic,
                front: card.front,
                back: card.back,
                text: originalText,
                createdAt: new Date(),
                exportStatus: 'not_exported' as const,
                ...(card.tags && { tags: card.tags }),
                ...(card.difficulty && { difficulty: card.difficulty }),
                ...(card.concept && { concept: card.concept }),
                ...(card.qualityScore && { qualityScore: card.qualityScore })
            };

            // Добавляем мультимедиа данные если есть
            if (card.attachedImages && card.attachedImages.length > 0) {
                // Используем первое изображение как основное
                const primaryImage = card.attachedImages[0];
                if (primaryImage.base64) {
                    baseCard.image = primaryImage.base64;
                    console.log('💾 Сохранено изображение в base64 формате для карточки:', baseCard.id);
                } else if (primaryImage.src) {
                    baseCard.imageUrl = primaryImage.src;
                    console.log('💾 Сохранена ссылка на изображение для карточки:', baseCard.id);
                }
            }

            // Также копируем изображения из существующих полей card.image и card.imageUrl
            if (card.image) {
                baseCard.image = card.image;
                console.log('💾 Скопировано изображение из card.image для карточки:', baseCard.id);
            }
            if (card.imageUrl) {
                baseCard.imageUrl = card.imageUrl;
                console.log('💾 Скопирована ссылка из card.imageUrl для карточки:', baseCard.id);
            }

            return baseCard;
        });
    }
}

// Фабрика для создания AI Agent Service
export const createAIAgentService = (aiService: AIService, apiKey: string): AIAgentService => {
    return new AIAgentService(aiService, apiKey);
};
