import React from 'react';
import MathRenderer from './MathRenderer';
import CodeBlock from './CodeBlock';
import '../styles/prism-theme.css';

interface RichMarkdownRendererProps {
  content: string;
  className?: string;
}

const RichMarkdownRenderer: React.FC<RichMarkdownRendererProps> = ({ content, className = '' }) => {
  // Функция для рендеринга содержимого с поддержкой всех элементов
  const renderRichContent = (text: string): React.ReactNode => {
    if (!text) return null;

    // Разбиваем текст на части и обрабатываем каждый элемент
    const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$|```[\s\S]*?```|`[^`\n]+`|!\[.*?\]\(.*?\)|\[.*?\]\(.*?\)|^\s*#.*$|^\s*##.*$|^\s*###.*$|^\s*####.*$|^\s*#####.*$|^\s*######.*$|^\s*[-*+]\s.*$|^\s*\d+\.\s.*$|^\s*>\s.*$|^\s*\|.*\|\s*$)/m);

    return parts.map((part, index) => {
      // Математические формулы (дисплей)
      if (part.match(/^\$\$[\s\S]*?\$\$/)) {
        const formula = part.slice(2, -2);
        return (
          <div key={index} className="math-display">
            <MathRenderer content={`$$${formula}$$`} />
          </div>
        );
      }

      // Математические формулы (инлайн)
      if (part.match(/\$[\s\S]*?\$/) && !part.match(/^\$\$/)) {
        const formula = part.slice(1, -1);
        return (
          <span key={index} className="math-inline">
            <MathRenderer content={`$${formula}$`} />
          </span>
        );
      }

      // Блоки кода
      if (part.match(/^```[\s\S]*?```/)) {
        const match = part.match(/^```(\w*)\n([\s\S]*?)\n```/);
        if (match) {
          const [, language, code] = match;
          return <CodeBlock key={index} code={code} language={language} />;
        }
        return <CodeBlock key={index} code={part.slice(3, -3)} />;
      }

      // Инлайн код
      if (part.match(/^`[^`\n]+`$/)) {
        return (
          <code key={index} className="inline-code">
            {part.slice(1, -1)}
          </code>
        );
      }

      // Изображения
      if (part.match(/!\[.*?\]\(.*?\)/)) {
        const match = part.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (match) {
          const [, alt, src] = match;
          const displayAlt = alt && alt !== 'Изображение' && alt !== 'Image' ? alt : '';
          return (
            <div key={index} className="markdown-image">
              <img src={src} alt={displayAlt} />
              {displayAlt && <div className="image-caption">{displayAlt}</div>}
            </div>
          );
        }
      }

      // Ссылки
      if (part.match(/\[.*?\]\(.*?\)/)) {
        const match = part.match(/\[([^\]]*)\]\(([^)]+)\)/);
        if (match) {
          const [, text, url] = match;
          return (
            <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="markdown-link">
              {text}
            </a>
          );
        }
      }

      // Заголовки
      if (part.match(/^#{1,6}\s/)) {
        const level = part.match(/^(#+)/)?.[1].length || 1;
        const text = part.replace(/^#+\s/, '');
        const Tag = `h${level}` as keyof JSX.IntrinsicElements;
        return (
          <Tag key={index} className={`markdown-heading heading-${level}`}>
            {text}
          </Tag>
        );
      }

      // Списки (маркированные)
      if (part.match(/^[-*+]\s/)) {
        return (
          <li key={index} className="markdown-list-item">
            {part.replace(/^[-*+]\s/, '')}
          </li>
        );
      }

      // Списки (нумерованные)
      if (part.match(/^\d+\.\s/)) {
        return (
          <li key={index} className="markdown-list-item">
            {part.replace(/^\d+\.\s/, '')}
          </li>
        );
      }

      // Цитаты
      if (part.match(/^>\s/)) {
        return (
          <blockquote key={index} className="markdown-quote">
            {part.replace(/^>\s/, '')}
          </blockquote>
        );
      }

      // Таблицы
      if (part.match(/^\s*\|.*\|\s*$/)) {
        // Простая обработка таблиц
        const rows = part.trim().split('\n');
        const isHeaderSeparator = (row: string) => row.match(/^\s*\|[\s\-:|]+\|\s*$/);

        return (
          <table key={index} className="markdown-table">
            <tbody>
              {rows.map((row, rowIndex) => {
                if (isHeaderSeparator(row)) return null;
                const cells = row.split('|').slice(1, -1).map(cell => cell.trim());
                const isHeader = rowIndex === 0 && !rows[rowIndex + 1]?.match(/^\s*\|[\s\-:|]+\|\s*$/);

                return (
                  <tr key={rowIndex}>
                    {cells.map((cell, cellIndex) => {
                      const CellTag = isHeader ? 'th' : 'td';
                      return (
                        <CellTag key={cellIndex} className="markdown-table-cell">
                          {cell}
                        </CellTag>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      }

      // Обычный текст с переносами строк
      if (part.trim()) {
        return (
          <span key={index} className="markdown-text">
            {part.split('\n').map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </span>
        );
      }

      return null;
    }).filter(Boolean);
  };

  return (
    <div className={`rich-markdown-renderer ${className}`}>
      {renderRichContent(content)}
    </div>
  );
};

export default RichMarkdownRenderer;
