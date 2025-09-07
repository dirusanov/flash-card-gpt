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
            contentAnalyzer: {
                name: 'Content Analyzer',
                role: 'Анализатор контента',
                systemPrompt: `Ты - Content Analyzer Agent, эксперт по анализу образовательного контента.
                Твоя задача - глубоко проанализировать текст, выделить ключевые концепции, определить связи между ними.
                Ты определяешь что важно изучать и как это лучше структурировать для запоминания.`,
                execute: this.executeContentAnalyzer.bind(this)
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
            cardGenerator: {
                name: 'Card Generator',
                role: 'Генератор карточек',
                systemPrompt: `Ты - Card Generator Agent, эксперт по созданию высококачественных образовательных карточек.

ТВОЯ ГЛАВНАЯ ЗАДАЧА:
Создавать карточки, которые действительно помогают понять и запомнить материал.

ПРИНЦИПЫ КАЧЕСТВЕННЫХ КАРТОЧЕК:
1. ИЗБЕГАЙ ОЧЕВИДНОГО - не создавай карточки где ответ содержится в вопросе
2. СОЗДАВАЙ ПОНИМАНИЕ - вопросы должны проверять понимание, а не механическое запоминание
3. БУДЬ КОНКРЕТНЫМ - избегай расплывчатых формулировок
4. ДОБАВЛЯЙ КОНТЕКСТ - объясняй "почему" и "как", а не только "что"
5. РАЗНООБРАЗЬ ТИПЫ - определения, примеры, применение, сравнения

ПЛОХИЕ ПРИМЕРЫ (НЕ ДЕЛАЙ ТАК):
❌ "Какой вид хищных млекопитающих представляет собой лев?" → "Лев - вид хищных млекопитающих"
❌ "Что такое фотосинтез?" → "Фотосинтез - это процесс фотосинтеза"

ХОРОШИЕ ПРИМЕРЫ:
✅ "К какому семейству относится лев и какие особенности это определяют?" → "Лев относится к семейству кошачьих. Основные особенности: втяжные когти, клыки для захвата добычи, бинокулярное зрение для охоты, гибкое тело для прыжков"
✅ "Почему львы живут прайдами, в отличие от других больших кошек?" → "Львы - единственные социальные большие кошки. Прайд помогает: совместно охотиться на крупную добычу, защищать территорию, воспитывать потомство"

ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ:
- Каждый вопрос должен проверять ПОНИМАНИЕ, а не память
- Ответы должны быть информативными и обучающими
- Избегай дублирования слов из вопроса в ответе
- Добавляй примеры и контекст где возможно`,
                execute: this.executeCardGenerator.bind(this)
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

    // 🚀 НОВЫЙ ОПТИМИЗИРОВАННЫЙ МЕТОД - объединение шагов для скорости
    async createCardsFromTextFast(text: string, pageContext?: PageContentContext, abortSignal?: AbortSignal): Promise<StoredCard[]> {
        try {
            console.log('⚡ FAST AI Agent Workflow: Optimized card creation with parallel processing');

            // Проверяем кэш
            const cacheKey = this.getCacheKey(text, 'fast');
            const cachedCards = this.getCachedResult(cacheKey);
            if (cachedCards) {
                console.log('⚡ CACHE HIT: Returning cached cards instantly');
                return this.convertToStoredCards(cachedCards, text);
            }

            // Создаем контекст workflow
            const context: WorkflowContext = {
                originalText: text,
                currentStep: 'fast_processing',
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

            // ОПТИМИЗАЦИЯ: Комбинированный анализ + генерация в одном API вызове
            console.log('⚡ FAST: Combined analysis and generation in single API call');
            const combinedResult = await this.executeFastCombinedProcess(text, pageContext, context, abortSignal);
            let finalCards = combinedResult.cards;

            // ОПТИМИЗАЦИЯ: Параллельная проверка качества (только для небольшого количества карточек)
            if (finalCards.length <= 3 && !abortSignal?.aborted) {
                console.log('⚡ FAST: Parallel quality validation');
                finalCards = await this.executeFastQualityValidation(finalCards, context, abortSignal);
            }

            // ОПТИМИЗАЦИЯ: Быстрое применение мультимедиа
            if (pageContext && pageContext.pageImages && pageContext.pageImages.length > 0 && !abortSignal?.aborted) {
                console.log('⚡ FAST: Fast multimedia application');
                finalCards = this.applyMultimediaFast(finalCards, pageContext);
            }

            console.log(`🎉 FAST Workflow completed: ${finalCards.length} cards created in reduced time`);

            // Сохраняем результат в кэш
            this.setCachedResult(cacheKey, finalCards);

            return this.convertToStoredCards(finalCards, text);

        } catch (error) {
            console.error('❌ Error in fast AI agent workflow:', error);
            // Больше не используем fallback к медленному методу - всегда быстрый режим
            throw error;
        }
    }

    // Быстрый комбинированный процесс: анализ + генерация в одном API вызове
    private async executeFastCombinedProcess(
        text: string,
        pageContext: PageContentContext | undefined,
        context: WorkflowContext,
        abortSignal?: AbortSignal
    ): Promise<{ cards: GeneratedCard[], analysis: any }> {

        const hasMultimedia = pageContext && (pageContext.pageImages?.length > 0 || pageContext.formulas?.length > 0 || pageContext.codeBlocks?.length > 0);

        const fastPrompt = `Ты - БЫСТРЫЙ ГЕНЕРАТОР КАРТОЧЕК ДЛЯ ВЫДЕЛЕННОГО ТЕКСТА. Создай качественные карточки ТОЛЬКО ПО ВЫДЕЛЕННОМУ ТЕКСТУ:

ВЫДЕЛЕННЫЙ ТЕКСТ: "${text}"

${hasMultimedia ? `ДОСТУПНЫЕ ИЗОБРАЖЕНИЯ: ${pageContext?.pageImages?.length || 0} шт (ОБЯЗАТЕЛЬНО включи если они релевантны!)` : 'МУЛЬТИМЕДИА: отсутствует'}

ПРАВИЛА СОЗДАНИЯ КАРТОЧЕК:
1. ТОЛЬКО по выделенному тексту - не придумывай новые концепты
2. КАЖДАЯ карточка должна быть основана на реальном содержании выделенного текста
3. НЕ создавай вопросы типа "Что такое..." если это не объяснено в тексте
4. Добавляй только РЕЛЕВАНТНЫЕ изображения из доступных
5. Максимум 3 карточки - фокус на качестве, не количестве

ТИПЫ КАРТОЧЕК (только по существу):
- ФАКТЫ: конкретные факты из текста
- ОПРЕДЕЛЕНИЯ: объяснения терминов из текста
- ПРОЦЕССЫ: шаги или последовательности из текста
- ПРИМЕРЫ: конкретные примеры из текста

JSON ОТВЕТ:
{
  "cards": [
    {
      "front": "Вопрос ТОЛЬКО по содержанию выделенного текста",
      "back": "Ответ на основе текста + контекст если нужно",
      "difficulty": "medium",
      "concept": "Тема из выделенного текста",
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

    // Быстрое применение мультимедиа с учетом релевантности
    private applyMultimediaFast(cards: GeneratedCard[], pageContext?: PageContentContext): GeneratedCard[] {
        if (!pageContext?.pageImages?.length) return cards;

        const images = pageContext.pageImages!;
        console.log(`🎨 Применение мультимедиа: ${images.length} изображений для ${cards.length} карточек`);

        return cards.map((card: GeneratedCard, index: number) => {
            // Находим наиболее релевантные изображения для этой карточки
            const relevantImages = this.findRelevantImagesForCard(card, images);

            if (relevantImages.length > 0) {
                const primaryImage = relevantImages[0];
                console.log(`🖼️ Карточка ${index + 1} "${card.front.substring(0, 30)}...": ${relevantImages.length} релевантных изображений`);

                return {
                    ...card,
                    attachedImages: relevantImages,
                    image: primaryImage.base64 || null,
                    imageUrl: primaryImage.src || null
                };
            }

            console.log(`📄 Карточка ${index + 1} "${card.front.substring(0, 30)}...": нет подходящих изображений`);
            return card;
        });
    }

    // Поиск релевантных изображений для карточки
    private findRelevantImagesForCard(card: GeneratedCard, images: PageImage[]): PageImage[] {
        const cardText = (card.front + ' ' + card.back + ' ' + (card.concept || '')).toLowerCase();
        const cardWords = cardText.split(/\s+/).filter(word => word.length > 2);

        // Оцениваем релевантность каждого изображения
        const scoredImages = images.map(image => {
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

            return {
                image,
                score,
                matches
            };
        });

        // Сортируем по релевантности и возвращаем топ изображений
        const relevantImages = scoredImages
            .filter(item => item.score > 2) // Минимальный порог релевантности
            .sort((a, b) => b.score - a.score)
            .slice(0, 2) // Максимум 2 изображения на карточку
            .map(item => item.image);

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
                    front: `Какой ключевой момент содержится в выделенном тексте?`,
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
                    front: `Что следует из выделенного текста?`,
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
                front: `Что важно в этом выделенном тексте?`,
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
    private async executeContentAnalyzer(text: string, context: WorkflowContext): Promise<ContentAnalysis> {
        const supervisorInstructions = context.previousResults.supervisor?.instructions?.contentAnalyzer || 
            'Проведи глубокий анализ контента';

        const prompt = `Ты - Content Analyzer Agent. Глубоко проанализируй образовательный контент.

ТЕКСТ: "${text}"

ИНСТРУКЦИИ ОТ SUPERVISOR: ${supervisorInstructions}

ТВОЯ ЗАДАЧА:
1. Определи основную тему и ключевые понятия
2. Выяви связи между концептами
3. Определи цели обучения
4. Оцени сложность материала
5. Оцени сколько карточек нужно

JSON ответ:
{
  "mainTopic": "Основная тема",
  "keyPoints": ["пункт1", "пункт2"],
  "concepts": [
    {
      "name": "Концепт1",
      "definition": "Определение",
      "importance": "high",
      "prerequisites": ["предпосылка1"],
      "examples": ["пример1"]
    }
  ],
  "relationships": [
    {
      "from": "Концепт1",
      "to": "Концепт2", 
      "type": "depends_on"
    }
  ],
  "learningObjectives": ["цель1", "цель2"],
  "complexity": "medium",
  "estimatedCards": 3
}`;

        try {
            const response = await this.aiService.createChatCompletion(this.apiKey, [
                { role: 'system', content: this.agents.contentAnalyzer.systemPrompt },
                { role: 'user', content: prompt }
            ]);

            if (!response?.content) {
                throw new Error('No response from content analyzer agent');
            }

            return this.parseJSONResponse(response.content, 'contentAnalyzer');
        } catch (error) {
            console.error('Content analyzer error:', error);
            return this.createFallbackContentAnalysis(text);
        }
    }

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