/**
 * Утилита для рендеринга математических формул с помощью KaTeX
 * Встраиваем KaTeX статически в бандл, чтобы избежать проблем CSP/динамических чанков
 */

// Статическое подключение KaTeX и стилей (гарантирует доступность без CDN)
import katexModule from 'katex';
import 'katex/dist/katex.min.css';

// Кэш для проверки загрузки KaTeX
let katexLoaded = false;
let katexPromise: Promise<any> | null = null;

/**
 * Динамически загружает KaTeX из CDN
 */
const loadKaTeX = async (): Promise<any> => {
    if (katexLoaded) {
        return (window as any).katex;
    }
    if (katexPromise) {
        return katexPromise;
    }
    // Используем статический модуль, подключённый при сборке
    try {
        const katex = (katexModule as any) || (window as any).katex;
        (window as any).katex = katex;
        katexLoaded = true;
        return katex;
    } catch (e) {
        console.warn('KaTeX static import failed:', e);
        // В крайне редком случае вернём ошибку, чтобы сработал sync fallback
        throw e;
    }
};

/**
 * Рендерит LaTeX формулу в HTML с помощью KaTeX
 * @param formula - LaTeX формула для рендеринга
 * @param displayMode - true для блочных формул ($$), false для inline формул ($)
 * @returns HTML строка с отрендеренной формулой
 */
export const renderLatexFormula = async (formula: string, displayMode: boolean = false): Promise<string> => {
    try {
        // Очищаем формулу от лишних пробелов
        const cleanFormula = formula.trim();
        
        if (!cleanFormula) {
            return '';
        }

        try {
            // Пытаемся загрузить KaTeX
            // console.log('🎯 Loading KaTeX for formula:', cleanFormula);
            const katex = await loadKaTeX();
            // console.log('✅ KaTeX loaded successfully');
            
            // Рендерим формулу с помощью KaTeX
            const renderedHtml = katex.renderToString(cleanFormula, {
                displayMode: displayMode,
                throwOnError: false,
                errorColor: '#cc0000',
                strict: 'ignore',
                trust: false,
                macros: {
                    "\\R": "\\mathbb{R}",
                    "\\N": "\\mathbb{N}",
                    "\\Z": "\\mathbb{Z}",
                    "\\Q": "\\mathbb{Q}",
                    "\\C": "\\mathbb{C}",
                }
            });

            if (displayMode) {
                return `<div class="katex-display">${renderedHtml}</div>`;
            } else {
                return `<span class="katex-inline">${renderedHtml}</span>`;
            }
        } catch (katexError) {
            console.warn('❌ KaTeX loading/render failed, falling back to simple display:', katexError);
            // Фоллбэк — более мягкий стиль без красного цвета
            if (displayMode) {
                return `<div style="text-align: center; margin: 12px 0; padding: 10px; background: #F1F5F9; border-radius: 6px; font-family: 'Times New Roman', serif;">${cleanFormula}</div>`;
            } else {
                return `<span style="background: #F1F5F9; padding: 2px 4px; border-radius: 3px; font-family: 'Times New Roman', serif;">${cleanFormula}</span>`;
            }
        }
    } catch (error) {
        console.warn('Formula rendering error:', error);
        if (displayMode) {
            return `<div style="text-align: center; margin: 12px 0; padding: 10px; background: #F1F5F9; border-radius: 6px; font-family: 'Times New Roman', serif;">${formula}</div>`;
        } else {
            return `<span style="background: #F1F5F9; padding: 2px 4px; border-radius: 3px; font-family: 'Times New Roman', serif;">${formula}</span>`;
        }
    }
};

/**
 * Синхронная версия для обратной совместимости (без KaTeX)
 */
export const renderLatexFormulaSync = (formula: string, displayMode: boolean = false): string => {
    const cleanFormula = formula.trim();

    if (!cleanFormula) {
        return '';
    }

    // Улучшенное отображение формул без KaTeX
    if (displayMode) {
        return `<div style="text-align: center; margin: 16px 0; padding: 12px 16px; background: linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%); border: 1px solid #CBD5E1; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="font-family: 'Times New Roman', serif; font-size: 16px; color: #1E293B; font-weight: 500; letter-spacing: 0.5px;">
                ${cleanFormula}
            </div>
        </div>`;
    } else {
        return `<span style="display: inline-block; margin: 0 4px; padding: 4px 8px; background: linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%); border: 1px solid #CBD5E1; border-radius: 6px; font-family: 'Times New Roman', serif; font-size: 14px; color: #334155; font-weight: 500; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
            ${cleanFormula}
        </span>`;
    }
};

/**
 * Обрабатывает весь текст и заменяет LaTeX формулы на отрендеренные HTML
 * @param content - содержимое с LaTeX формулами
 * @returns HTML с отрендеренными формулами
 */
export const processLatexInContent = (content: string): string => {
    let processedContent = content;

    // 0) Базовая санация мусора MathML/невидимых символов + нормализация функций
    processedContent = basicMathSanitize(processedContent);
    processedContent = normalizeLatexMarkers(processedContent);

    // Превращаем маркдаун-подобные формулы без $ в блочные $$..$$ по ключевым словам
    processedContent = processedContent.replace(/(^|\n)\s*(Формула:)?\s*g\s*=\s*([^\n<]+)(?=\n|$)/gi, (m, p1, lead, eq) => {
        const normalized = eq.trim()
            .replace(/\^(\d+)/g, '^{$1}')
            .replace(/·/g, '\\cdot')
            .replace(/\|/g, ' \\mid ');
        return `${p1}$$g = ${normalized}$$`;
    });

    // Обрабатываем блочные формулы
    processedContent = processedContent.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
        return renderLatexFormulaSync(formula, true);
    });

    // Эвристика: кортежи/векторы без $ — оборачиваем в inline $...$
    processedContent = processedContent.replace(/\(([^()]+)\)/g, (match, inner, offset, whole) => {
        // Не оборачиваем, если рядом уже стоят $ (скорее всего уже формула)
        const before = whole.slice(Math.max(0, offset - 1), offset);
        const after = whole.slice(offset + match.length, offset + match.length + 1);
        if (before === '$' || after === '$') return match;

        // Признаки математики внутри скобок
        const looksLikeMath = /_[{]?\d+|\\{1,2}(ldots|sum|frac)|\^[{]?\d+/.test(inner) || /[a-zA-Z]\s*[+\-]/.test(inner);
        if (!looksLikeMath) return match;

        const normalized = inner
            .replace(/\\{2,}([A-Za-z])/g, '\\$1')
            .replace(/\^(\d+)/g, '^{$1}')
            .replace(/·/g, '\\cdot')
            .replace(/\|/g, ' \\mid ');
        return `$(${normalized})$`;
    });

    // Обрабатываем inline формулы
    processedContent = processedContent.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (match, formula) => {
        return renderLatexFormulaSync(formula, false);
    });

    return processedContent;
};

/**
 * Асинхронная версия для динамической загрузки KaTeX
 * @param content - содержимое с LaTeX формулами
 * @returns Promise с HTML содержащим отрендеренные формулы
 */
export const processLatexInContentAsync = async (content: string): Promise<string> => {
    // Предварительная нормализация: санация + добавление делимитеров там, где их нет
    let processedContent = normalizeLatexMarkers(basicMathSanitize(content));

    // Найдем все формулы
    const blockFormulas = Array.from(processedContent.matchAll(/\$\$([^$]+)\$\$/g));
    const inlineFormulas = Array.from(processedContent.matchAll(/(?<!\$)\$([^$\n]+)\$(?!\$)/g));

    console.log(`🎯 Processing ${blockFormulas.length} block formulas and ${inlineFormulas.length} inline formulas`);

    // Обрабатываем блочные формулы
    for (const match of blockFormulas) {
        try {
            const rendered = await renderLatexFormula(match[1], true);
            processedContent = processedContent.replace(match[0], rendered);
            console.log(`✅ Processed block formula: ${match[1].substring(0, 30)}...`);
        } catch (error) {
            console.warn(`❌ Failed to process block formula: ${match[1]}`, error);
            // Используем fallback
            const fallback = renderLatexFormulaSync(match[1], true);
            processedContent = processedContent.replace(match[0], fallback);
        }
    }

    // Обрабатываем inline формулы
    for (const match of inlineFormulas) {
        try {
            const rendered = await renderLatexFormula(match[1], false);
            processedContent = processedContent.replace(match[0], rendered);
            console.log(`✅ Processed inline formula: ${match[1].substring(0, 30)}...`);
        } catch (error) {
            console.warn(`❌ Failed to process inline formula: ${match[1]}`, error);
            // Используем fallback
            const fallback = renderLatexFormulaSync(match[1], false);
            processedContent = processedContent.replace(match[0], fallback);
        }
    }

    return processedContent;
};

/**
 * Тестовая функция для проверки работы KaTeX
 * @param testFormula - формула для тестирования
 * @returns Promise с результатом теста
 */
export const testKaTeXRendering = async (testFormula: string = 'm_{a}^{2} + m_{b}^{2} + m_{c}^{2} = \\frac{3}{4} S'): Promise<{
    original: string;
    blockResult: string;
    inlineResult: string;
    syncBlockResult: string;
    syncInlineResult: string;
}> => {
    console.log('🧪 Testing KaTeX rendering with formula:', testFormula);

    const blockResult = await renderLatexFormula(testFormula, true);
    const inlineResult = await renderLatexFormula(testFormula, false);
    const syncBlockResult = renderLatexFormulaSync(testFormula, true);
    const syncInlineResult = renderLatexFormulaSync(testFormula, false);

    console.log('📊 Test results:');
    console.log('Block (async):', blockResult.substring(0, 100) + '...');
    console.log('Inline (async):', inlineResult.substring(0, 100) + '...');
    console.log('Block (sync):', syncBlockResult.substring(0, 100) + '...');
    console.log('Inline (sync):', syncInlineResult.substring(0, 100) + '...');

    return {
        original: testFormula,
        blockResult,
        inlineResult,
        syncBlockResult,
        syncInlineResult
    };
};

/**
 * Приватный хелпер: нормализует содержание, добавляя делимитеры $...$ и конвертируя
 * распространённые русские обозначения функций в LaTeX-макросы.
 */
function normalizeLatexMarkers(input: string): string {
    let text = input;

    // Русские сокращения математических функций → LaTeX
    // Только если далее сразу идёт скобка ( ( или [ )
    text = text
        .replace(/\barctg\s*(?=\(|\[)/gi, '\\arctan')
        .replace(/\btg\s*(?=\(|\[)/gi, '\\tan')
        .replace(/\bctg\s*(?=\(|\[)/gi, '\\cot')
        .replace(/\bsh\s*(?=\(|\[)/gi, '\\sinh')
        .replace(/\bch\s*(?=\(|\[)/gi, '\\cosh')
        .replace(/\bth\s*(?=\(|\[)/gi, '\\tanh')
        .replace(/\blg\s*(?=\(|\[)/gi, '\\log')
        .replace(/\bln\s*(?=\(|\[)/gi, '\\ln');

    // Оборачиваем выражения вида \func[ ... ] → $\func\left[ ... \right]$
    text = text.replace(/(?<!\$)(\\(?:tan|cot|arctan|arcsin|arccos|sinh|cosh|tanh|sin|cos|log|ln))\s*\[([^\]\n]+)\](?!\$)/gi,
        (_m, fn, inner) => `$\\${fn}\\left[${inner}\\right]$`);

    // Оборачиваем функции с круглой скобкой: sin(x) → $\sin(x)$ (если ещё не обёрнуто)
    text = text.replace(/(?<!\$)\b(sin|cos|tan|cot|arctan|arcsin|arccos|sinh|cosh|tanh|log|ln)\s*\(([^()\n]+)\)(?!\$)/gi,
        (_m, fn, inner) => `$\\${fn}(${inner})$`);

    // Оборачиваем простые LaTeX-макросы без делимитеров
    // \frac{...}{...}
    text = text.replace(/(?<!\$)(\\frac\{[^}]+\}\{[^}]+\})(?!\$)/g, '$$$1$');
    // \sqrt{...}
    text = text.replace(/(?<!\$)(\\sqrt\{[^}]+\})(?!\$)/g, '$$$1$');
    // Греческие буквы и базовые макросы в чистом виде — оборачиваем как inline, если рядом буквы/скобки
    text = text.replace(/(?<!\$)(\\(?:alpha|beta|gamma|delta|epsilon|pi|sigma|theta|omega|mu|lambda|phi))(?![a-zA-Z])(?!\$)/g, '$$$1$');

    // Простая дробь вида ( ... ) / ( ... ) → $$\frac{...}{...}$$
    text = text.replace(/\(\s*([^()]+?)\s*\)\s*\/\s*\(\s*([^()]+?)\s*\)/g, (_m, a, b) => `$$\\frac{${a}}{${b}}$$`);

    // Plain tan[...] → $\\tan\\left[...\\right]$
    text = text.replace(/(?<!\$)\b(tan|cot)\s*\[([^\]\n]+)\](?!\$)/gi,
        (_m, fn, inner) => `$\\${fn.toLowerCase()}\\left[${inner}\\right]$`);

    // Половинный аргумент в tan[ 1 2 (X) ] → $\\tan\\left[\\tfrac{1}{2}(X)\\right]$
    text = text.replace(/\\tan\\left\[\s*1\s+2\s*(\([^\)]+\))\s*\]/gi,
        (_m, p1) => `$\\tan\\left[\\tfrac{1}{2}${p1}\\right]$`);

    // Схлопываем артефактные «1 2 2 1» → «1 2» и превращаем «1 2 (X)» → \tfrac{1}{2}(X)
    text = text.replace(/\b1\s*2\s*2\s*1\b/g, '1 2');
    text = text.replace(/\b1\s*2\b(?=\s*\()/g, '\\tfrac{1}{2}');

    // Удаляем дубликаты формул, появляющиеся подряд
    text = text.replace(/(\$\$[^$]+\$\$)\s*\1/g, '$1');
    text = text.replace(/(?<!\$)(\$[^$]+\$)\s*\1(?!\$)/g, '$1');

    return text;
}

/**
 * Базовая санация мусора MathML/HTML и невидимых символов + нормализация math-юникода
 */
function basicMathSanitize(input: string): string {
    let s = input;
    // Удаляем zero-width/служебные символы и NBSP
    s = s.replace(/[\u200B-\u200D\u2060\u2061\uFEFF\u00A0]/g, ' ');

    // Удаляем annotation/x-application-tex хвосты
    s = s.replace(/<annotation[\s\S]*?<\/annotation>/gi, '')
         .replace(/application[^a-zA-Z]*x?[^a-zA-Z]*tex/gi, '');

    // Удаляем любые HTML/MathML теги
    s = s.replace(/<[^>]*>/g, ' ');

    // Убираем хвосты W3C/MathML
    s = s.replace(/https?:\/\/\s*w\s*3\s*\.\s*o\s*r\s*g\s*\/\s*1998\s*\/\s*Math\s*\/\s*MathML/gi, '')
         .replace(/\bw\s*3\s*\.\s*o\s*r\s*g\b/gi, '')
         .replace(/\b1998\s*org\s*\/?/gi, '')
         .replace(/\borg\s*1998\b/gi, '')
         .replace(/\b1998\s*\/\s*Math\s*\/\s*MathML\b/gi, '')
         .replace(/MathMLMath/gi, '')
         .replace(/\bMathML\b/gi, '');

    // Нормализуем математические алфавиты в ASCII
    s = normalizeMathAlphanumerics(s);

    // Склеиваем разорванные буквы в слова (a p p l i c a t i o n → application)
    s = s.replace(/\b([A-Za-z])(?:\s+[A-Za-z])+\b/g, (m) => m.replace(/\s+/g, ''));

    // Убираем лишние пробелы/переводы строк
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

function normalizeMathAlphanumerics(str: string): string {
    let out = '';
    for (let i = 0; i < str.length; ) {
        const cp = str.codePointAt(i)!;
        const ch = String.fromCodePoint(cp);
        let repl: string | null = null;

        if (cp >= 0x1D400 && cp <= 0x1D419) repl = String.fromCharCode(65 + (cp - 0x1D400)); // Bold A-Z
        else if (cp >= 0x1D41A && cp <= 0x1D433) repl = String.fromCharCode(97 + (cp - 0x1D41A)); // Bold a-z
        else if (cp >= 0x1D434 && cp <= 0x1D44D) repl = String.fromCharCode(65 + (cp - 0x1D434)); // Italic A-Z
        else if (cp >= 0x1D44E && cp <= 0x1D467) repl = String.fromCharCode(97 + (cp - 0x1D44E)); // Italic a-z
        else if (cp >= 0x1D468 && cp <= 0x1D481) repl = String.fromCharCode(65 + (cp - 0x1D468)); // Bold Italic A-Z
        else if (cp >= 0x1D482 && cp <= 0x1D49B) repl = String.fromCharCode(97 + (cp - 0x1D482)); // Bold Italic a-z
        else if (cp >= 0x1D7CE && cp <= 0x1D7D7) repl = String.fromCharCode(48 + (cp - 0x1D7CE)); // Bold digits 0–9
        else if (cp === 0x210E) repl = 'h'; // ℎ → h

        out += repl ?? ch;
        i += ch.length;
    }
    return out;
}
