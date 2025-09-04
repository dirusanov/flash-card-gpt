/**
 * Утилита для рендеринга математических формул с помощью KaTeX
 * Использует динамическую загрузку KaTeX из CDN для уменьшения размера bundle
 */

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
    
    katexPromise = new Promise((resolve, reject) => {
        // Загружаем CSS
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css';
        document.head.appendChild(cssLink);
        
        // Загружаем JS
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js';
        script.onload = () => {
            katexLoaded = true;
            resolve((window as any).katex);
        };
        script.onerror = () => {
            reject(new Error('Failed to load KaTeX from CDN'));
        };
        document.head.appendChild(script);
    });
    
    return katexPromise;
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
            console.log('🎯 Loading KaTeX for formula:', cleanFormula);
            const katex = await loadKaTeX();
            console.log('✅ KaTeX loaded successfully');
            
            // Рендерим формулу с помощью KaTeX
            const renderedHtml = katex.renderToString(cleanFormula, {
                displayMode: displayMode,
                throwOnError: false, // Не бросаем ошибки, а показываем исходный текст
                errorColor: '#cc0000',
                strict: false, // Менее строгий режим для лучшей совместимости
                trust: false, // Безопасность
                macros: {
                    // Добавляем популярные макросы для удобства
                    "\\R": "\\mathbb{R}",
                    "\\N": "\\mathbb{N}",
                    "\\Z": "\\mathbb{Z}",
                    "\\Q": "\\mathbb{Q}",
                    "\\C": "\\mathbb{C}",
                }
            });

            console.log('🎨 KaTeX rendered formula successfully:', renderedHtml.substring(0, 100) + '...');
            
            // Оборачиваем в div с соответствующими стилями
            if (displayMode) {
                return `<div style="text-align: center; margin: 12px 0; padding: 8px; background: #F8FAFC; border-radius: 6px;">${renderedHtml}</div>`;
            } else {
                return `<span style="margin: 0 2px;">${renderedHtml}</span>`;
            }
        } catch (katexError) {
            console.warn('❌ KaTeX loading failed, falling back to simple display:', katexError);
            // Фоллбэк - простое отображение формулы
            if (displayMode) {
                return `<div style="text-align: center; margin: 12px 0; padding: 8px; background: #FEF2F2; border-radius: 6px; color: #DC2626; font-family: serif;">
                    <strong>Формула:</strong> ${cleanFormula}
                </div>`;
            } else {
                return `<code style="background: #FEF2F2; color: #DC2626; padding: 2px 4px; border-radius: 3px; font-family: serif;">$${cleanFormula}$</code>`;
            }
        }
    } catch (error) {
        console.warn('Formula rendering error:', error);
        // Возвращаем исходную формулу в случае ошибки
        if (displayMode) {
            return `<div style="text-align: center; margin: 12px 0; padding: 8px; background: #FEF2F2; border-radius: 6px; color: #DC2626; font-family: serif;">
                <strong>Формула:</strong> ${formula}
            </div>`;
        } else {
            return `<code style="background: #FEF2F2; color: #DC2626; padding: 2px 4px; border-radius: 3px; font-family: serif;">$${formula}$</code>`;
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

    if (displayMode) {
        return `<div style="text-align: center; margin: 12px 0; padding: 8px; background: #F8FAFC; border-radius: 6px; color: #374151; font-family: serif;">
            <strong>Формула:</strong> ${cleanFormula}
        </div>`;
    } else {
        return `<code style="background: #F3F4F6; color: #374151; padding: 2px 4px; border-radius: 3px; font-family: serif;">$${cleanFormula}$</code>`;
    }
};

/**
 * Обрабатывает весь текст и заменяет LaTeX формулы на отрендеренные HTML
 * @param content - содержимое с LaTeX формулами
 * @returns HTML с отрендеренными формулами
 */
export const processLatexInContent = (content: string): string => {
    let processedContent = content;
    
    // Обрабатываем блочные формулы ($$...$$)
    processedContent = processedContent.replace(/\$\$([^$]+)\$\$/g, (match, formula) => {
        return renderLatexFormulaSync(formula, true);
    });
    
    // Обрабатываем inline формулы ($...$), но не затрагиваем уже обработанные блочные
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
    let processedContent = content;
    
    // Найдем все формулы
    const blockFormulas = Array.from(processedContent.matchAll(/\$\$([^$]+)\$\$/g));
    const inlineFormulas = Array.from(processedContent.matchAll(/(?<!\$)\$([^$\n]+)\$(?!\$)/g));
    
    // Обрабатываем блочные формулы
    for (const match of blockFormulas) {
        const rendered = await renderLatexFormula(match[1], true);
        processedContent = processedContent.replace(match[0], rendered);
    }
    
    // Обрабатываем inline формулы
    for (const match of inlineFormulas) {
        const rendered = await renderLatexFormula(match[1], false);
        processedContent = processedContent.replace(match[0], rendered);
    }
    
    return processedContent;
};