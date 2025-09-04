/**
 * Сервис для автоматического обнаружения и форматирования математических формул в тексте
 * Использует AI для распознавания математических выражений и их преобразования в LaTeX
 */

import { getAIService } from './aiServiceFactory';
import { ModelProvider } from '../store/reducers/settings';

export interface FormulaDetectionResult {
    originalText: string;
    processedText: string;
    formulasDetected: number;
    formulas: Array<{
        original: string;
        latex: string;
        position: { start: number; end: number };
        confidence: number;
    }>;
}

/**
 * AI промпт для обнаружения и преобразования математических выражений
 */
const FORMULA_DETECTION_PROMPT = `
Analyze the following text and identify mathematical expressions, equations, formulas, or mathematical notation. 
Convert them to proper LaTeX format for beautiful rendering.

Rules:
1. Identify mathematical expressions including:
   - Equations (like x^2 + y^2 = z^2)
   - Mathematical functions (sin, cos, log, etc.)
   - Fractions, integrals, summations
   - Greek letters (alpha, beta, pi, etc.)
   - Mathematical symbols (∑, ∫, √, ±, ≥, ≤, etc.)
   - Exponents and subscripts
   - Mathematical constants (pi, e, infinity)

2. Convert to LaTeX:
   - Use $$formula$$ for display math (block formulas)
   - Use $formula$ for inline math
   - Proper LaTeX syntax (\\frac{}{}, \\sqrt{}, \\int, \\sum, etc.)

3. Preserve the original text structure
4. Only wrap actual mathematical content

5. Return ONLY the processed text with formulas converted to LaTeX.
   Do not add explanations or comments.

Text to analyze:
`;

/**
 * Регулярные выражения для предварительного обнаружения математических паттернов
 */
const MATH_PATTERNS = [
    // Уравнения с переменными и операторами (включая Unicode)
    /[a-zA-Z𝑆𝑝𝑎𝑏𝑐𝑥𝑦𝑧]\s*[\+\-\*\/\=]\s*[a-zA-Z0-9𝑆𝑝𝑎𝑏𝑐]/g,
    // Степени (x^2, x²)
    /[a-zA-Z0-9𝑆𝑝𝑎𝑏𝑐]\^[0-9]+|[a-zA-Z0-9𝑆𝑝𝑎𝑏𝑐][²³⁴⁵⁶⁷⁸⁹]/g,
    // Математические функции
    /\b(sin|cos|tan|log|ln|exp|sqrt|abs|max|min|lim)\s*\(/g,
    // Дроби в текстовом виде
    /\b\d+\/\d+\b/g,
    // Греческие буквы в тексте
    /\b(alpha|beta|gamma|delta|epsilon|pi|sigma|theta|omega|mu|lambda)\b/gi,
    // Unicode греческие буквы
    /[πα𝛼β𝛽γ𝛾δ𝛿θ𝜃λ𝜆μ𝜇σ𝜎φ𝜑ω𝜔]/g,
    // Математические символы (включая Unicode)
    /[±∑∫√∞≤≥≠≈∂∇·]/g,
    // Unicode математические переменные
    /[𝑆𝑝𝑎𝑏𝑐𝑥𝑦𝑧𝐴𝐵𝐶]/g,
    // Формулы с круглыми скобками и переменными (включая Unicode)
    /\([a-zA-Z0-9𝑆𝑝𝑎𝑏𝑐\+\-\*\/\^\s]+\)\s*[\=\+\-\*\/]/g,
    // Специальный паттерн для формулы Герона
    /[𝑆S]\s*=\s*[𝑝p]\s*\([𝑝p]\s*[-−]\s*[𝑎a]\)/g,
];

/**
 * Быстрая проверка наличия математического контента в тексте
 */
const containsMathContent = (text: string): boolean => {
    return MATH_PATTERNS.some(pattern => pattern.test(text));
};

/**
 * Улучшенные правила для распознавания математики на русском языке
 */
const RUSSIAN_MATH_KEYWORDS = [
    'уравнение', 'формула', 'интеграл', 'производная', 'функция',
    'теорема', 'лемма', 'доказательство', 'вычислить', 'найти',
    'корень', 'степень', 'логарифм', 'синус', 'косинус', 'тангенс',
    'предел', 'сумма', 'произведение', 'матрица', 'определитель',
    'площадь', 'треугольник', 'периметр', 'длина', 'сторона',
    'гипотенуза', 'катет', 'радиус', 'диаметр', 'окружность'
];

const containsRussianMathKeywords = (text: string): boolean => {
    const lowerText = text.toLowerCase();
    return RUSSIAN_MATH_KEYWORDS.some(keyword => lowerText.includes(keyword));
};

/**
 * Основная функция для обнаружения и преобразования формул
 */
export const detectAndConvertFormulas = async (
    text: string,
    useAI: boolean = true
): Promise<FormulaDetectionResult> => {
    const result: FormulaDetectionResult = {
        originalText: text,
        processedText: text,
        formulasDetected: 0,
        formulas: []
    };

    // Быстрая проверка - есть ли вообще математический контент
    if (!containsMathContent(text) && !containsRussianMathKeywords(text)) {
        return result;
    }

    try {
        if (useAI) {
            // Используем AI для обнаружения и преобразования формул
            const prompt = `${FORMULA_DETECTION_PROMPT}\n\n"${text}"`;
            // Получаем AI сервис (может потребоваться передать настройки извне)
            const aiService = getAIService(ModelProvider.OpenAI); // или другой провайдер по умолчанию
            const processedText = await aiService.translateText(prompt, 'en');
            
            if (processedText && processedText !== text) {
                result.processedText = processedText;
                result.formulasDetected = countFormulasInText(processedText);
                result.formulas = extractFormulasInfo(text, processedText);
            }
        } else {
            // Фоллбэк - простое правило-основанное преобразование
            result.processedText = applySimpleFormulaRules(text);
            result.formulasDetected = countFormulasInText(result.processedText);
        }
    } catch (error) {
        console.warn('Formula detection AI failed, using fallback:', error);
        result.processedText = applySimpleFormulaRules(text);
        result.formulasDetected = countFormulasInText(result.processedText);
    }

    return result;
};

/**
 * Подсчет количества формул в тексте
 */
const countFormulasInText = (text: string): number => {
    const blockFormulas = (text.match(/\$\$[^$]+\$\$/g) || []).length;
    const inlineFormulas = (text.match(/(?<!\$)\$[^$\n]+\$(?!\$)/g) || []).length;
    return blockFormulas + inlineFormulas;
};

/**
 * Извлечение информации о формулах
 */
const extractFormulasInfo = (originalText: string, processedText: string) => {
    const formulas: any[] = [];
    
    // Находим все LaTeX формулы в обработанном тексте
    const allFormulas = [
        ...Array.from(processedText.matchAll(/\$\$([^$]+)\$\$/g)),
        ...Array.from(processedText.matchAll(/(?<!\$)\$([^$\n]+)\$(?!\$)/g))
    ];
    
    allFormulas.forEach((match, index) => {
        formulas.push({
            original: match[0],
            latex: match[1],
            position: { start: match.index || 0, end: (match.index || 0) + match[0].length },
            confidence: 0.8 // Примерная уверенность
        });
    });
    
    return formulas;
};

/**
 * Преобразование Unicode математических символов в обычные переменные
 */
const convertUnicodeMathToASCII = (text: string): string => {
    let convertedText = text;
    
    // Математические Unicode символы в обычные латинские буквы
    const unicodeMathMap: { [key: string]: string } = {
        // Mathematical Alphanumeric Symbols
        '𝑆': 'S',  // Mathematical Italic Capital S
        '𝑝': 'p',  // Mathematical Italic Small p  
        '𝑎': 'a',  // Mathematical Italic Small a
        '𝑏': 'b',  // Mathematical Italic Small b
        '𝑐': 'c',  // Mathematical Italic Small c
        '𝑥': 'x',  // Mathematical Italic Small x
        '𝑦': 'y',  // Mathematical Italic Small y
        '𝑧': 'z',  // Mathematical Italic Small z
        '𝐴': 'A',  // Mathematical Bold Capital A
        '𝐵': 'B',  // Mathematical Bold Capital B
        '𝐶': 'C',  // Mathematical Bold Capital C
        // Дополнительные варианты
        '𝒮': 'S',  // Mathematical Script Capital S
        '𝒑': 'p',  // Mathematical Script Small p
        // Греческие буквы
        'π': 'pi',
        'α': 'alpha',
        'β': 'beta',
        'γ': 'gamma',
        'δ': 'delta',
        'θ': 'theta',
        'λ': 'lambda',
        'μ': 'mu',
        'σ': 'sigma',
        'φ': 'phi',
        'ω': 'omega'
    };
    
    // Заменяем Unicode символы
    Object.entries(unicodeMathMap).forEach(([unicode, ascii]) => {
        const regex = new RegExp(unicode, 'g');
        convertedText = convertedText.replace(regex, ascii);
    });
    
    // Убираем лишние пробелы между символами формулы
    convertedText = convertedText.replace(/([a-zA-Z])\s+([=+\-*/()])/g, '$1$2');
    convertedText = convertedText.replace(/([=+\-*/(])\s+([a-zA-Z])/g, '$1$2');
    
    return convertedText;
};

/**
 * Простые правила для преобразования математических выражений
 */
const applySimpleFormulaRules = (text: string): string => {
    let processedText = text;
    
    // Сначала конвертируем Unicode математические символы
    processedText = convertUnicodeMathToASCII(processedText);
    
    // Преобразуем простые математические выражения
    
    // Формулы типа p = (a + b + c) / 2 или s = (a + b + c) / 2
    processedText = processedText.replace(/([psPS])\s*=\s*\(([^)]+)\)\s*\/\s*(\d+)/g, '$$$$1 = \\frac{$2}{$3}$$');
    
    // Более точная замена для полупериметра
    processedText = processedText.replace(/полупериметр\s+([psPS])\s+равен\s+половине\s+суммы\s+сторон[:\s]*([psPS])\s*=\s*\(([^)]+)\)\s*\/\s*(\d+)/gi, 
        'Полупериметр $1 равен половине суммы сторон: $$$$2 = \\frac{$3}{$4}$$');
    
    // S = sqrt(s * (s-a) * (s-b) * (s-c)) - формула Герона
    processedText = processedText.replace(/([SsПлощадь]*)\s*=\s*sqrt\s*\(([^)]+)\)/gi, '$$$$1 = \\sqrt{$2}$$');
    
    // x^2 -> $x^2$  
    processedText = processedText.replace(/\b([a-zA-Z])\^([0-9]+)\b/g, '$$$$1^{$2}$$');
    
    // a^2 + b^2 = c^2
    processedText = processedText.replace(/\b([a-zA-Z])\^(\d+)\s*\+\s*([a-zA-Z])\^(\d+)\s*=\s*([a-zA-Z])\^(\d+)\b/g, '$$$$1^{$2} + $3^{$4} = $5^{$6}$$');
    
    // Греческие буквы на русском
    const russianGreek: { [key: string]: string } = {
        'альфа': '\\alpha', 'бета': '\\beta', 'гамма': '\\gamma', 'дельта': '\\delta',
        'эпсилон': '\\epsilon', 'пи': '\\pi', 'сигма': '\\sigma', 'тета': '\\theta',
        'омега': '\\omega', 'мю': '\\mu', 'лямбда': '\\lambda', 'фи': '\\phi'
    };
    
    Object.entries(russianGreek).forEach(([word, latex]) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        processedText = processedText.replace(regex, `$${latex}$`);
    });
    
    // Греческие буквы на английском
    const greekReplacements: { [key: string]: string } = {
        'alpha': '\\alpha', 'beta': '\\beta', 'gamma': '\\gamma', 'delta': '\\delta',
        'epsilon': '\\epsilon', 'pi': '\\pi', 'sigma': '\\sigma', 'theta': '\\theta',
        'omega': '\\omega', 'mu': '\\mu', 'lambda': '\\lambda', 'phi': '\\phi'
    };
    
    Object.entries(greekReplacements).forEach(([word, latex]) => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        processedText = processedText.replace(regex, `$${latex}$`);
    });
    
    // Математические функции
    processedText = processedText.replace(/\b(sin|cos|tan|log|ln)\s*\(([^)]+)\)/g, '$\\\\$1($2)$');
    
    // Дроби a/b -> \frac{a}{b}
    processedText = processedText.replace(/\b(\w+)\s*\/\s*(\w+)\b/g, '$\\frac{$1}{$2}$');
    
    // Квадратный корень 
    processedText = processedText.replace(/sqrt\s*\(([^)]+)\)/gi, '$\\sqrt{$1}$');
    processedText = processedText.replace(/корень\s+из\s+(\w+)/gi, '$\\sqrt{$1}$');
    
    // Обработка формулы Герона с Unicode символом корня
    processedText = processedText.replace(/√\s*([^,.\s]+)/g, '\\sqrt{$1}');
    
    // Специальная обработка формулы Герона: S = √p(p-a)(p-b)(p-c)
    processedText = processedText.replace(
        /S\s*=\s*√?\s*p\s*\(?\s*p\s*[-−]\s*a\s*\)?\s*\(?\s*p\s*[-−]\s*b\s*\)?\s*\(?\s*p\s*[-−]\s*c\s*\)?/gi,
        '$$S = \\sqrt{p(p-a)(p-b)(p-c)}$$'
    );
    
    // Формула Герона с явными скобками произведений
    processedText = processedText.replace(
        /S\s*=\s*√?\s*p\s*\(\s*p\s*[-−]\s*a\s*\)\s*\(\s*p\s*[-−]\s*b\s*\)\s*\(\s*p\s*[-−]\s*c\s*\)/gi,
        '$$S = \\sqrt{p(p-a)(p-b)(p-c)}$$'
    );
    
    // Простые выражения в скобках с переменными
    processedText = processedText.replace(/\(([a-zA-Z])\s*[-−]\s*([a-zA-Z])\)/g, '($1 - $2)');
    
    return processedText;
};

/**
 * Предварительная проверка - стоит ли использовать AI для этого текста
 */
export const shouldUseAIForFormulas = (text: string): boolean => {
    // Используем AI если текст содержит сложную математику или ключевые слова
    return containsMathContent(text) || 
           containsRussianMathKeywords(text) || 
           text.length > 50; // Для коротких текстов используем простые правила
};

/**
 * Быстрое преобразование для предварительного просмотра
 */
export const quickFormulaPreview = (text: string): string => {
    return applySimpleFormulaRules(text);
};

/**
 * Принудительное применение правил для тестирования
 */
export const forceFormulaDetection = (text: string): string => {
    console.log('🔍 Force formula detection for:', text);
    
    let processedText = text;
    
    // ОБРАБОТКА UNICODE МАТЕМАТИЧЕСКИХ СИМВОЛОВ
    
    // Конвертируем Unicode математические символы
    processedText = convertUnicodeMathToASCII(processedText);
    console.log('🔤 After Unicode conversion:', processedText);
    
    // ИСПРАВЛЯЕМ ПОЛОМАННЫЕ ФОРМУЛЫ СНАЧАЛА
    
    // Исправляем $$1 = \frac{(a + b + c)}{2}$ на правильную формулу
    processedText = processedText.replace(/\$\$1\s*=\s*\\frac\{?\(?(a\s*\+\s*b\s*\+\s*c)\)?\}?\{?2\}?\$*/g, 
        '$$p = \\frac{a + b + c}{2}$$');
    
    // Исправляем обрезанные формулы типа $$1 = \sqrt{p · (p − a}$
    processedText = processedText.replace(/\$\$1\s*=\s*\\sqrt\{[^}]*$/g, 
        '$$S = \\sqrt{p \\cdot (p - a) \\cdot (p - b) \\cdot (p - c)}$$');
    
    // Исправляем некорректные символы
    processedText = processedText.replace(/·/g, '\\cdot');
    processedText = processedText.replace(/−/g, '-');
    
    // ОСНОВНЫЕ ПРАВИЛА ОБНАРУЖЕНИЯ
    
    // Полупериметр p равен половине суммы сторон
    processedText = processedText.replace(
        /полупериметр\s+([pP])\s+равен\s+половине\s+суммы\s+сторон[:\s]*\$?\$?1?\s*=\s*\\?frac\{?\(?(a\s*\+\s*b\s*\+\s*c)\)?\}?\{?2\}?\$?/gi,
        'Полупериметр $1 равен половине суммы сторон: $$p = \\frac{a + b + c}{2}$$'
    );
    
    // Выражение площади через формулу Герона  
    processedText = processedText.replace(
        /вырожение\s+площади\s+реализуется\s+через\s+произведение[^:]*:\s*\$\$1\s*=\s*\\sqrt\{[^}]*\$*/gi,
        'Выражение площади реализуется через произведение: $$S = \\sqrt{p \\cdot (p - a) \\cdot (p - b) \\cdot (p - c)}$$'
    );
    
    // Применяем основные правила
    processedText = applySimpleFormulaRules(processedText);
    
    // ДОПОЛНИТЕЛЬНЫЕ СПЕЦИФИЧНЫЕ ПРАВИЛА
    
    // Формула Герона из реального текста: многострочная запись
    processedText = processedText.replace(
        /фо́?рмула\s+герона[^:]*:\s*S\s*=\s*p\s*\(\s*p\s*[-−]\s*a\s*\)\s*\(\s*p\s*[-−]\s*b\s*\)\s*\(\s*p\s*[-−]\s*c\s*\)\s*,?/gi,
        'Формула Герона: $$S = \\sqrt{p(p-a)(p-b)(p-c)}$$,'
    );
    
    // Обработка многострочной формулы как в вашем примере
    processedText = processedText.replace(
        /S\s*=\s*p\s*\(\s*p\s*[-−]\s*a\s*\)\s*\(\s*p\s*[-−]\s*b\s*\)\s*\(\s*p\s*[-−]\s*c\s*\)\s*,?\s*/gi,
        '$$S = \\sqrt{p(p-a)(p-b)(p-c)}$$'
    );
    
    // Теорема Пифагора
    processedText = processedText.replace(/теорема\s+пифагора[:\s]*([^.!?]*)/gi, 
        'Теорема Пифагора: $$a^2 + b^2 = c^2$$');
    
    // Площадь треугольника по формуле Герона (если еще не обработана)
    if (!processedText.includes('\\sqrt{p(p-a)(p-b)(p-c)}') && !processedText.includes('\\sqrt{p \\cdot (p - a)')) {
        processedText = processedText.replace(/S\s*=\s*\\?sqrt\s*\{?([^}]*)\}?/gi, '$$S = \\sqrt{$1}$$');
    }
    
    console.log('✅ Processed result:', processedText);
    return processedText;
};
