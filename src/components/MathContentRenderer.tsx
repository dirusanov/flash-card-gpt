import React, { useState, useEffect, useRef } from 'react';
import { processLatexInContentAsync } from '../utils/katexRenderer';
import { detectAndConvertFormulas, shouldUseAIForFormulas, forceFormulaDetection } from '../services/formulaDetectionService';

interface MathContentRendererProps {
    content: string;
    className?: string;
    style?: React.CSSProperties;
    enableAI?: boolean;
    onProcessingComplete?: (hasFormulas: boolean) => void;
}

const mathRenderCache = new Map<string, { html: string; hasFormulas: boolean }>();

/**
 * Компонент для красивого отображения контента с математическими формулами
 * Автоматически обнаруживает и рендерит формулы как в ChatGPT
 */
const MathContentRenderer: React.FC<MathContentRendererProps> = ({
    content,
    className = '',
    style = {},
    enableAI = true,
    onProcessingComplete
}) => {
    const [processedContent, setProcessedContent] = useState<string>(content);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [hasFormulas, setHasFormulas] = useState<boolean>(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const processedKeyRef = useRef<string>('');
    const requestIdRef = useRef(0);

    // Обработка контента при изменении
    useEffect(() => {
        const cacheKey = `${enableAI ? '1' : '0'}::${content}`;
        if (cacheKey === processedKeyRef.current) return;
        processedKeyRef.current = cacheKey;

        const cached = mathRenderCache.get(cacheKey);
        if (cached) {
            setProcessedContent(cached.html);
            setHasFormulas(cached.hasFormulas);
            setIsProcessing(false);
            onProcessingComplete?.(cached.hasFormulas);
            return;
        }

        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        processContent(content, enableAI, cacheKey, requestId);
    }, [content, enableAI]);

    useEffect(() => () => {
        requestIdRef.current += 1;
    }, []);

    const processContent = async (text: string, useAI: boolean, cacheKey: string, requestId: number) => {
        if (!text?.trim()) {
            if (requestIdRef.current !== requestId) return;
            setProcessedContent('');
            setHasFormulas(false);
            onProcessingComplete?.(false);
            return;
        }

        if (requestIdRef.current !== requestId) return;
        setIsProcessing(true);

        try {
            // 0) Санитизация странных вставок (MathML/zero-width/italic unicode)
            let cleanedText = sanitizeBrokenMathPaste(text);

            // 1) Сначала очищаем от поломанных формул и исправляем их
            cleanedText = cleanedText
                // Удаляем поломанные LaTeX формулы
                .replace(/\$\$1\s*=\s*[^$]*\$*/g, '')
                // Исправляем некорректные символы
                .replace(/·/g, '*')
                .replace(/−/g, '-')
                // Убираем незакрытые формулы
                .replace(/\$\$[^$]*$/g, '');

            // 2) ГРУБЫЕ ЭВРИСТИКИ: автоматическое оборачивание одиночных уравнений в $$ .. $$
            // 1) После фразы "по формуле:" часто следует строка-уравнение — оборачиваем её в блочную формулу
            cleanedText = cleanedText.replace(/(по\s+формуле\s*:|formula\s*:)[\s\n]*([^\n]+?)(?=(\n|\.|$))/gi, (m, lead, eq) => {
                const normalized = eq
                    .replace(/\^(\d+)/g, '^{$1}') // x^2 -> x^{2}
                    .trim();
                return `${lead}\n$$${normalized}$$`;
            });

            // 2) Любая отдельная строка вида "g = ..." или "S=..." — считаем уравнением
            cleanedText = cleanedText.replace(/(^|\n)\s*([A-Za-zА-Яа-я][A-Za-zА-Яа-я0-9_\s\(\)\^+\-\\\/\*·=]+=[^\n]+)\s*(?=\n|$)/g, (m, p1, eq) => {
                const normalized = eq
                    .replace(/·/g, '\\cdot')
                    .replace(/\^(\d+)/g, '^{$1}')
                    .trim();
                return `${p1}$$${normalized}$$`;
            });
            
            // 3) Принудительно применяем обнаружение формул для тестирования
            let processedText = forceFormulaDetection(cleanedText);

            // 4) НОРМАЛИЗАЦИЯ ОБРАТНЫХ СЛЭШЕЙ: сводим \\macro → \macro универсально
            processedText = processedText
                .replace(/\\{2,}([A-Za-z]+)/g, '\\$1')
                .replace(/\\{2,}\{/g, '\\{')
                .replace(/\\{2,}\}/g, '\\}')
                .replace(/\\{2,}\^/g, '\\^')
                .replace(/\\{2,}_/g, '\\_')
                .replace(/\\{2,}\$/g, '\\$')
                // частые макросы для подстраховки
                .replace(/\\{2,}mathbb/g, '\\mathbb')
                .replace(/\\{2,}mathcal/g, '\\mathcal')
                .replace(/\\{2,}times/g, '\\times')
                .replace(/\\{2,}sum/g, '\\sum');
            
            // Проверяем, были ли найдены формулы
            const formulaCount = (processedText.match(/\$\$[^$]+\$\$/g) || []).length + 
                               (processedText.match(/(?<!\$)\$[^$\n]+\$(?!\$)/g) || []).length;
            let finalHasFormulas = formulaCount > 0;
            if (requestIdRef.current !== requestId) return;
            setHasFormulas(finalHasFormulas);
            
            // Если не нашли формулы, попробуем AI или простые правила
            if (formulaCount === 0) {
                if (useAI && shouldUseAIForFormulas(text)) {
                    try {
                        const result = await detectAndConvertFormulas(text, true);
                        if (result.formulasDetected > 0) {
                            processedText = result.processedText;
                            finalHasFormulas = true;
                            if (requestIdRef.current !== requestId) return;
                            setHasFormulas(true);
                        }
                    } catch (aiError) {
                        console.warn('AI formula detection failed, using simple rules:', aiError);
                        const fallbackResult = await detectAndConvertFormulas(text, false);
                        processedText = fallbackResult.processedText;
                        finalHasFormulas = fallbackResult.formulasDetected > 0;
                        if (requestIdRef.current !== requestId) return;
                        setHasFormulas(finalHasFormulas);
                    }
                } else {
                    const result = await detectAndConvertFormulas(text, false);
                    processedText = result.processedText;
                    finalHasFormulas = result.formulasDetected > 0;
                    if (requestIdRef.current !== requestId) return;
                    setHasFormulas(finalHasFormulas);
                }
            }

            // Рендерим LaTeX формулы с помощью KaTeX
            const finalContent = await processLatexInContentAsync(processedText);
            if (requestIdRef.current !== requestId) return;
            
            mathRenderCache.set(cacheKey, { html: finalContent, hasFormulas: finalHasFormulas });
            setProcessedContent(finalContent);
            onProcessingComplete?.(finalHasFormulas);

        } catch (error) {
            if (requestIdRef.current !== requestId) return;
            console.error('Content processing error:', error);
            // В случае ошибки показываем оригинальный текст
            setProcessedContent(text);
            setHasFormulas(false);
            onProcessingComplete?.(false);
        } finally {
            if (requestIdRef.current !== requestId) return;
            setIsProcessing(false);
        }
    };

    // Удаляет невидимые символы, приводит математические юникод-буквы к ASCII,
    // вычищает шум от MathML/TeX-атрибутов и экранирует < > для безопасной вставки
    function sanitizeBrokenMathPaste(input: string): string {
        let s = input;

        // 0) Удаляем zero-width и служебные юникод-символы (в т.ч. U+2061 Function Application)
        s = s.replace(/[\u200B-\u200D\u2060\u2061\uFEFF]/g, '');

        // 1) Убираем артефакты от копирования MathML/TeX
        s = s
            .replace(/https?:\/\/[^\s]*org\/MathML[^\s]*/gi, '')
            .replace(/\borg\s*\/\s*MathML\b/gi, '')
            .replace(/application-tex\"?>?/gi, '')
            .replace(/xapplication-tex/gi, '')
            .replace(/MathMLMath/gi, '')
            .replace(/data-tex\s*=\s*\"[^\"]*\"/gi, '')
            .replace(/aria-hidden=\"true\"/gi, '');

        // 2) Нормализуем математические юникод-буквы (Mathematical Alphanumeric Symbols)
        s = normalizeMathAlphanumerics(s);

        // 2.1) Удаляем типичные хвосты от W3C MathML (включая разбитые пробелами/переносами варианты)
        //   Примеры: "http://www.w3.org/1998/Math/MathML", "w3.org/1998/Math/MathML", "1998org/"
        s = s
            .replace(/https?:\/\/\s*w\s*3\s*\.\s*o\s*r\s*g\s*\/\s*1998\s*\/\s*Math\s*\/\s*MathML/gi, '')
            .replace(/\bw\s*3\s*\.\s*o\s*r\s*g\b/gi, '')
            .replace(/\b1998\s*org\s*\/?/gi, '')
            .replace(/\borg\b\s*1998/gi, '')
            .replace(/\b1998\s*\/\s*Math\s*\/\s*MathML\b/gi, '')
            .replace(/MathMLMath/gi, '')
            .replace(/\bMathML\b/gi, '');

        // 2.2) Удаляем атрибуты и куски, которые оказываются в тексте
        s = s
            .replace(/xmlns\s*=\s*"[^"]*MathML[^"]*"/gi, '')
            .replace(/display\s*=\s*"block"/gi, '')
            .replace(/<annotation[\s\S]*?<\/annotation>/gi, '')
            .replace(/application[^a-zA-Z]*x?[^a-zA-Z]*tex/gi, '');

        // 2.3) Убираем тэги и огрызки HTML/MathML целиком (оставляем чистый текст)
        s = s.replace(/<[^>]*>/g, '');
        s = s.replace(/\b(semantics|mrow|mfrac|mi|mo)\b/gi, '');

        // 3) Безопасно экранируем угловые скобки ТОЛЬКО если это не уже отрендеренный KaTeX/MathML
        // После удаления тегов экранировать нечего — но подстрахуемся на случай оставшихся знаков
        s = s.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;');

        // 4) Схлопываем множественные пробелы/переводы строк
        s = s.replace(/[\u00A0\t ]+/g, ' ').replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

        return s;
    }

    // Преобразование юникод-математических букв (italic/bold/etc.) в ASCII
    function normalizeMathAlphanumerics(str: string): string {
        let out = '';
        for (let i = 0; i < str.length; ) {
            const cp = str.codePointAt(i)!;
            const ch = String.fromCodePoint(cp);
            let repl: string | null = null;

            // Bold A-Z (U+1D400–U+1D419), bold a-z (U+1D41A–U+1D433)
            if (cp >= 0x1D400 && cp <= 0x1D419) repl = String.fromCharCode('A'.charCodeAt(0) + (cp - 0x1D400));
            else if (cp >= 0x1D41A && cp <= 0x1D433) repl = String.fromCharCode('a'.charCodeAt(0) + (cp - 0x1D41A));
            // Italic A-Z (U+1D434–U+1D44D), italic a-z (U+1D44E–U+1D467)
            else if (cp >= 0x1D434 && cp <= 0x1D44D) repl = String.fromCharCode('A'.charCodeAt(0) + (cp - 0x1D434));
            else if (cp >= 0x1D44E && cp <= 0x1D467) repl = String.fromCharCode('a'.charCodeAt(0) + (cp - 0x1D44E));
            // Bold italic A-Z (U+1D468–U+1D481), bold italic a-z (U+1D482–U+1D49B)
            else if (cp >= 0x1D468 && cp <= 0x1D481) repl = String.fromCharCode('A'.charCodeAt(0) + (cp - 0x1D468));
            else if (cp >= 0x1D482 && cp <= 0x1D49B) repl = String.fromCharCode('a'.charCodeAt(0) + (cp - 0x1D482));
            // Digits (bold) 0–9 (U+1D7CE–U+1D7D7)
            else if (cp >= 0x1D7CE && cp <= 0x1D7D7) repl = String.fromCharCode('0'.charCodeAt(0) + (cp - 0x1D7CE));
            // Planck constant ℎ → h
            else if (cp === 0x210E) repl = 'h';

            out += repl ?? ch;
            i += ch.length;
        }

        // Иногда при копировании буквы разделяются пробелами: "a p p l i c a t i o n" → "application"
        out = out.replace(/\b([A-Za-z])\s(?:[A-Za-z]\s+){2,}[A-Za-z]\b/g, (m) => m.replace(/\s+/g, ''));
        return out;
    }

    // Базовые стили для ChatGPT-подобного отображения
    const baseStyles: React.CSSProperties = {
        lineHeight: '1.6',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        color: '#374151',
        fontSize: '14px',
        wordWrap: 'break-word',
        ...style
    };

    // Стили для обработки состояния
    const processingStyles: React.CSSProperties = isProcessing ? {
        opacity: 0.7,
        transition: 'opacity 0.2s ease'
    } : {};

    return (
        <div 
            ref={contentRef}
            className={`math-content-renderer ${className} ${hasFormulas ? 'has-formulas' : ''}`}
            style={{ ...baseStyles, ...processingStyles }}
        >
            {isProcessing && hasFormulas && (
                <div style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    fontSize: '10px',
                    color: '#6B7280',
                    background: 'rgba(255,255,255,0.8)',
                    padding: '1px 4px',
                    borderRadius: '2px',
                    fontWeight: '500'
                }}>
                    Rendering math...
                </div>
            )}
            
            <div 
                dangerouslySetInnerHTML={{ __html: processedContent }}
                style={{
                    position: 'relative'
                }}
            />
            
            {/* Встроенные стили для математического контента */}
            <style>{`
                .math-content-renderer .katex {
                    font-size: 1.1em !important;
                    color: #1f2937 !important;
                }
                
                .math-content-renderer .katex-display {
                    margin: 16px 0 !important;
                    padding: 12px !important;
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
                    border-radius: 8px !important;
                    border: 1px solid #e2e8f0 !important;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
                    position: relative !important;
                    overflow-x: auto !important;
                }
                
                .math-content-renderer .katex-display::before {
                    content: '';
                    position: absolute;
                    top: 8px;
                    right: 8px;
                    width: 12px;
                    height: 12px;
                    background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%236B7280"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>') no-repeat center;
                    background-size: contain;
                    opacity: 0.3;
                }
                
                .math-content-renderer .katex:not(.katex-display) {
                    background: rgba(99, 102, 241, 0.1) !important;
                    padding: 2px 4px !important;
                    border-radius: 4px !important;
                    margin: 0 1px !important;
                    font-weight: 500 !important;
                }
                
                .math-content-renderer code {
                    background: #f3f4f6 !important;
                    padding: 2px 6px !important;
                    border-radius: 4px !important;
                    font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', Consolas, 'Courier New', monospace !important;
                    font-size: 0.9em !important;
                    color: #4b5563 !important;
                    border: 1px solid #e5e7eb !important;
                }
                
                .math-content-renderer pre {
                    background: #1f2937 !important;
                    color: #f9fafb !important;
                    padding: 16px !important;
                    border-radius: 8px !important;
                    overflow-x: auto !important;
                    margin: 12px 0 !important;
                    font-family: 'SF Mono', Monaco, 'Inconsolata', 'Roboto Mono', Consolas, 'Courier New', monospace !important;
                    font-size: 0.9em !important;
                    line-height: 1.5 !important;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1) !important;
                }
                
                .math-content-renderer img {
                    max-width: 100% !important;
                    height: auto !important;
                    border-radius: 6px !important;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
                    margin: 8px 0 !important;
                }
                
                .math-content-renderer h1,
                .math-content-renderer h2,
                .math-content-renderer h3 {
                    color: #1f2937 !important;
                    font-weight: 600 !important;
                    margin: 16px 0 8px 0 !important;
                }
                
                .math-content-renderer p {
                    margin: 8px 0 !important;
                    line-height: 1.6 !important;
                }
                
                .math-content-renderer ul,
                .math-content-renderer ol {
                    margin: 8px 0 !important;
                    padding-left: 20px !important;
                }
                
                .math-content-renderer li {
                    margin: 4px 0 !important;
                }
                
                .math-content-renderer blockquote {
                    border-left: 4px solid #e5e7eb !important;
                    margin: 12px 0 !important;
                    padding: 8px 16px !important;
                    background: #f9fafb !important;
                    color: #6b7280 !important;
                    font-style: italic !important;
                    border-radius: 0 4px 4px 0 !important;
                }
                
                .math-content-renderer.has-formulas {
                    min-height: 40px;
                }
                
                @media (max-width: 640px) {
                    .math-content-renderer .katex {
                        font-size: 1em !important;
                    }
                    
                    .math-content-renderer .katex-display {
                        margin: 12px 0 !important;
                        padding: 8px !important;
                        font-size: 0.9em !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default MathContentRenderer;
