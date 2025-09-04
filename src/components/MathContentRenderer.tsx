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
    const processedRef = useRef<string>('');

    // Обработка контента при изменении
    useEffect(() => {
        if (content === processedRef.current) return;
        processedRef.current = content;
        
        processContent(content);
    }, [content, enableAI]);

    const processContent = async (text: string) => {
        if (!text?.trim()) {
            setProcessedContent('');
            setHasFormulas(false);
            onProcessingComplete?.(false);
            return;
        }

        console.log('🔧 MathContentRenderer processing:', text);
        setIsProcessing(true);

        try {
            // Сначала очищаем от поломанных формул и исправляем их
            let cleanedText = text
                // Удаляем поломанные LaTeX формулы
                .replace(/\$\$1\s*=\s*[^$]*\$*/g, '')
                // Исправляем некорректные символы
                .replace(/·/g, '*')
                .replace(/−/g, '-')
                // Убираем незакрытые формулы
                .replace(/\$\$[^$]*$/g, '');
            
            console.log('🧹 Cleaned text:', cleanedText);
            
            // Принудительно применяем обнаружение формул для тестирования
            let processedText = forceFormulaDetection(cleanedText);
            
            // Проверяем, были ли найдены формулы
            const formulaCount = (processedText.match(/\$\$[^$]+\$\$/g) || []).length + 
                               (processedText.match(/(?<!\$)\$[^$\n]+\$(?!\$)/g) || []).length;
            
            console.log('📊 Found formulas:', formulaCount);
            setHasFormulas(formulaCount > 0);
            
            // Если не нашли формулы, попробуем AI или простые правила
            if (formulaCount === 0) {
                if (enableAI && shouldUseAIForFormulas(text)) {
                    try {
                        console.log('🤖 Trying AI formula detection...');
                        const result = await detectAndConvertFormulas(text, true);
                        if (result.formulasDetected > 0) {
                            processedText = result.processedText;
                            setHasFormulas(true);
                            console.log('✅ AI found formulas:', result.formulasDetected);
                        }
                    } catch (aiError) {
                        console.warn('❌ AI formula detection failed, using simple rules:', aiError);
                        const fallbackResult = await detectAndConvertFormulas(text, false);
                        processedText = fallbackResult.processedText;
                        setHasFormulas(fallbackResult.formulasDetected > 0);
                    }
                } else {
                    console.log('📝 Using simple formula rules...');
                    const result = await detectAndConvertFormulas(text, false);
                    processedText = result.processedText;
                    setHasFormulas(result.formulasDetected > 0);
                }
            }

            console.log('🎨 Rendering with KaTeX:', processedText);
            // Рендерим LaTeX формулы с помощью KaTeX
            const finalContent = await processLatexInContentAsync(processedText);
            console.log('✨ Final rendered content:', finalContent);
            
            setProcessedContent(finalContent);
            onProcessingComplete?.(hasFormulas);

        } catch (error) {
            console.error('❌ Content processing error:', error);
            // В случае ошибки показываем оригинальный текст
            setProcessedContent(content);
            setHasFormulas(false);
            onProcessingComplete?.(false);
        } finally {
            setIsProcessing(false);
        }
    };

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
