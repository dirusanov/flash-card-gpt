import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  content: string;
  className?: string;
}

const MathRenderer: React.FC<MathRendererProps> = ({ content, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderMath = () => {
      if (!containerRef.current) return;

      try {
        let processedContent = content;

        // Обработка display math ($$...$$ или \[...\])
        processedContent = processedContent.replace(/\$\$([^$]+)\$\$/g, (match, math) => {
          try {
            return `<div class="math-display">${katex.renderToString(math, {
              displayMode: true,
              throwOnError: false,
              errorColor: '#cc0000'
            })}</div>`;
          } catch (error) {
            console.warn('KaTeX display math error:', error);
            return `<div class="math-error">Ошибка в формуле: ${math}</div>`;
          }
        });

        processedContent = processedContent.replace(/\\\[([^\\]]+)\\\]/g, (match, math) => {
          try {
            return `<div class="math-display">${katex.renderToString(math, {
              displayMode: true,
              throwOnError: false,
              errorColor: '#cc0000'
            })}</div>`;
          } catch (error) {
            console.warn('KaTeX display math error:', error);
            return `<div class="math-error">Ошибка в формуле: ${math}</div>`;
          }
        });

        // Обработка inline math ($...$ или \(...\))
        processedContent = processedContent.replace(/\$([^$]+)\$/g, (match, math) => {
          try {
            return `<span class="math-inline">${katex.renderToString(math, {
              displayMode: false,
              throwOnError: false,
              errorColor: '#cc0000'
            })}</span>`;
          } catch (error) {
            console.warn('KaTeX inline math error:', error);
            return `<span class="math-error">${math}</span>`;
          }
        });

        processedContent = processedContent.replace(/\\\(([^\\)]+)\\\)/g, (match, math) => {
          try {
            return `<span class="math-inline">${katex.renderToString(math, {
              displayMode: false,
              throwOnError: false,
              errorColor: '#cc0000'
            })}</span>`;
          } catch (error) {
            console.warn('KaTeX inline math error:', error);
            return `<span class="math-error">${math}</span>`;
          }
        });

        containerRef.current.innerHTML = processedContent;
      } catch (error) {
        console.warn('KaTeX rendering failed, falling back to basic display:', error);
        // Fallback: просто отображаем формулы как текст
        if (containerRef.current) {
          containerRef.current.innerHTML = content.replace(/\$\$([^$]+)\$\$/g, '<div style="text-align: center; margin: 12px 0; padding: 8px; background: #F8FAFC; border-radius: 6px;"><strong>Формула:</strong> $1</div>')
                                                  .replace(/\$([^$]+)\$/g, '<span style="background: #F8FAFC; padding: 2px 4px; border-radius: 4px;">$1</span>');
        }
      }
    };

    renderMath();
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={`math-renderer ${className}`}
    />
  );
};

export default MathRenderer;
