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

// Главный класс для управления AI агентами
export class AIAgentService {
    private aiService: AIService;
    private apiKey: string;
    private agents: { [key: string]: AIAgent };

    constructor(aiService: AIService, apiKey: string) {
        this.aiService = aiService;
        this.apiKey = apiKey;
        this.agents = this.initializeAgents();
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
                systemPrompt: `Ты - Question Quality Agent, эксперт по оценке качества образовательных вопросов.
                Твоя задача - проверять каждый вопрос на актуальность, полезность и качество.
                Ты отфильтровываешь глупые, бесполезные или некачественные вопросы.`,
                execute: this.executeQuestionQuality.bind(this)
            },
            cardGenerator: {
                name: 'Card Generator',
                role: 'Генератор карточек',
                systemPrompt: `Ты - Card Generator Agent, эксперт по созданию качественных образовательных карточек.
                Твоя задача - создавать карточки на основе инструкций от Supervisor и анализа от Content Analyzer.
                Ты создаешь вопросы которые помогают понять и запомнить ключевую информацию.`,
                execute: this.executeCardGenerator.bind(this)
            },
            validator: {
                name: 'Validator',
                role: 'Валидатор и улучшатель',
                systemPrompt: `Ты - Validator Agent, финальный эксперт по проверке и улучшению карточек.
                Твоя задача - провести комплексную оценку всех карточек и при необходимости улучшить их.
                Ты следишь за тем, чтобы карточки были максимально полезны для изучения.`,
                execute: this.executeValidator.bind(this)
            }
        };
    }

    // Основной метод - orchestrator workflow
    async createCardsFromText(text: string, abortSignal?: AbortSignal): Promise<StoredCard[]> {
        try {
            console.log('🚀 AI Agent Workflow: Starting intelligent card creation');
            
            // Создаем контекст workflow
            const context: WorkflowContext = {
                originalText: text,
                currentStep: 'initialization',
                previousResults: {},
                metadata: {
                    textLength: text.length,
                    language: this.detectLanguage(text),
                    topic: '',
                    complexity: this.estimateComplexity(text)
                }
            };

            // Check if cancelled before starting
            if (abortSignal?.aborted) {
                throw new Error('AI card creation was cancelled by user');
            }

            // Шаг 1: Supervisor анализирует и планирует
            console.log('🧠 Step 1: Supervisor planning');
            context.currentStep = 'supervisor_planning';
            const supervisorDecision = await this.agents.supervisor.execute(text, context);
            context.previousResults.supervisor = supervisorDecision;

            // Check if cancelled after supervisor
            if (abortSignal?.aborted) {
                throw new Error('AI card creation was cancelled by user');
            }

            // Шаг 2: Content Analyzer анализирует контент
            console.log('📊 Step 2: Content analysis');
            context.currentStep = 'content_analysis';
            const contentAnalysis = await this.agents.contentAnalyzer.execute(text, context);
            context.previousResults.contentAnalysis = contentAnalysis;
            context.metadata.topic = contentAnalysis.mainTopic;

            // Check if cancelled after content analysis
            if (abortSignal?.aborted) {
                throw new Error('AI card creation was cancelled by user');
            }

            // Шаг 3: Card Generator создает карточки
            console.log('🎯 Step 3: Card generation');
            context.currentStep = 'card_generation';
            const generatedCards = await this.agents.cardGenerator.execute({
                text,
                analysis: contentAnalysis,
                instructions: supervisorDecision.instructions.cardGenerator
            }, context);
            context.previousResults.generatedCards = generatedCards;

            // Check if cancelled after card generation
            if (abortSignal?.aborted) {
                throw new Error('AI card creation was cancelled by user');
            }

            // Шаг 4: Question Quality проверяет каждый вопрос
            console.log('🔍 Step 4: Question quality check');
            context.currentStep = 'quality_check';
            const qualityResults: QuestionQuality[] = [];
            for (const card of generatedCards) {
                // Check if cancelled during quality checks
                if (abortSignal?.aborted) {
                    throw new Error('AI card creation was cancelled by user');
                }
                const qualityCheck = await this.agents.questionQuality.execute(card, context);
                qualityResults.push(qualityCheck);
            }
            context.previousResults.qualityResults = qualityResults;

            // Фильтруем карточки по качеству
            const qualityCards = generatedCards.filter((card: GeneratedCard, index: number) => 
                qualityResults[index].isWorthwhile && qualityResults[index].qualityScore >= 7
            );

            console.log(`✅ Quality filter: ${qualityCards.length}/${generatedCards.length} cards passed`);

            // Check if cancelled before validation
            if (abortSignal?.aborted) {
                throw new Error('AI card creation was cancelled by user');
            }

            // Шаг 5: Validator проводит финальную проверку
            console.log('🔬 Step 5: Final validation');
            context.currentStep = 'final_validation';
            const validationResult = await this.agents.validator.execute({
                cards: qualityCards,
                originalText: text,
                context
            }, context);

            // Выбираем финальные карточки
            const finalCards = validationResult.improvedCards || qualityCards;
            
            console.log(`🎉 Workflow completed: ${finalCards.length} high-quality cards created`);
            console.log(`📈 Overall score: ${validationResult.overallScore}/100`);

            return this.convertToStoredCards(finalCards, text);

        } catch (error) {
            console.error('❌ Error in AI agent workflow:', error);
            throw error;
        }
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

    // Card Generator Agent - создает карточки
    private async executeCardGenerator(input: any, context: WorkflowContext): Promise<GeneratedCard[]> {
        const { text, analysis, instructions } = input;

        const prompt = `Ты - Card Generator Agent. Создай высококачественные образовательные карточки.

ТЕКСТ: "${text}"

АНАЛИЗ КОНТЕНТА:
- Тема: ${analysis.mainTopic}
- Ключевые понятия: ${analysis.concepts.map((c: ConceptInfo) => c.name).join(', ')}
- Цели обучения: ${analysis.learningObjectives.join(', ')}
- Сложность: ${analysis.complexity}

ИНСТРУКЦИИ ОТ SUPERVISOR: ${instructions}

ПРИНЦИПЫ КАЧЕСТВЕННЫХ КАРТОЧЕК:
1. Один вопрос - один концепт
2. Четкие, конкретные вопросы
3. Полные, точные ответы
4. Практическая применимость
5. Прогрессивная сложность

СОЗДАЙ КАРТОЧКИ ДЛЯ КАЖДОГО ВАЖНОГО КОНЦЕПТА.

JSON ответ:
{
  "cards": [
    {
      "front": "Четкий вопрос",
      "back": "Полный ответ",
      "tags": ["тег1"],
      "difficulty": "medium",
      "concept": "Название концепта"
    }
  ]
}`;

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
        const prompt = `Ты - Question Quality Agent. Оцени качество образовательного вопроса.

КАРТОЧКА:
Вопрос: "${card.front}"
Ответ: "${card.back}"
Концепт: ${card.concept || 'не указан'}

ОРИГИНАЛЬНЫЙ ТЕКСТ: "${context.originalText}"

КРИТЕРИИ ОЦЕНКИ (0-10 баллов):
1. КАЧЕСТВО ВОПРОСА:
   - Ясность формулировки
   - Однозначность
   - Педагогическая ценность

2. РЕЛЕВАНТНОСТЬ:
   - Соответствие тексту
   - Важность для понимания темы
   - Практическая значимость

3. УРОВЕНЬ СЛОЖНОСТИ:
   - Соответствие контексту
   - Познавательная нагрузка
   - Обучающий потенциал

ОТКЛОНИ ВОПРОС ЕСЛИ:
- Слишком простой/очевидный
- Не связан с текстом
- Плохо сформулирован
- Не несет образовательной ценности

JSON ответ:
{
  "question": "${card.front}",
  "answer": "${card.back}",
  "qualityScore": 8,
  "relevanceScore": 9,
  "difficultyScore": 7,
  "issues": ["проблема если есть"],
  "improvements": ["как улучшить"],
  "isWorthwhile": true,
  "reasoning": "Подробное объяснение оценки"
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

    // Validator Agent - финальная проверка
    private async executeValidator(input: any, context: WorkflowContext): Promise<ValidationResult> {
        const { cards, originalText } = input;

        const prompt = `Ты - Validator Agent. Проведи финальную проверку набора карточек.

ОРИГИНАЛЬНЫЙ ТЕКСТ: "${originalText}"

КАРТОЧКИ (${cards.length} шт):
${cards.map((card: GeneratedCard, i: number) => `
${i + 1}. Q: ${card.front}
   A: ${card.back}
   Концепт: ${card.concept || 'не указан'}
`).join('')}

КОНТЕКСТ WORKFLOW:
- Тема: ${context.metadata.topic}
- Стратегия: ${context.previousResults.supervisor?.strategy}

ПРОВЕРЬ:
1. Полнота покрытия темы (0-25 баллов)
2. Качество карточек (0-25 баллов)  
3. Логическая последовательность (0-25 баллов)
4. Практическая ценность (0-25 баллов)

ЕСЛИ ОБЩИЙ БАЛЛ < 80, ПРЕДЛОЖИ УЛУЧШЕНИЯ.

JSON ответ:
{
  "isValid": true,
  "overallScore": 85,
  "cardScores": {0: 85, 1: 90},
  "issues": ["проблема если есть"],
  "suggestions": ["предложение1"],
  "improvedCards": [...],
  "finalRecommendation": "Рекомендация по использованию"
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

    // Конвертация в StoredCard
    private convertToStoredCards(cards: GeneratedCard[], originalText: string): StoredCard[] {
        return cards.map((card, index) => ({
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
        }));
    }
}

// Фабрика для создания AI Agent Service
export const createAIAgentService = (aiService: AIService, apiKey: string): AIAgentService => {
    return new AIAgentService(aiService, apiKey);
};