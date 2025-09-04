import React, { useEffect, useRef } from 'react';
import Prism from 'prismjs';

// Импортируем языки Prism
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-xml-doc';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-bash';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = '', className = '' }) => {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      // Применяем подсветку Prism
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  // Определяем язык для Prism
  const getPrismLanguage = (lang: string): string => {
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'csharp': 'csharp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'sql': 'sql',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'css': 'css',
      'scss': 'scss',
      'bash': 'bash',
      'sh': 'bash',
      'shell': 'bash'
    };

    return languageMap[lang.toLowerCase()] || lang.toLowerCase();
  };

  const prismLang = getPrismLanguage(language);

  return (
    <div className={`code-block-container ${className}`}>
      {language && (
        <div className="code-block-header">
          <span className="code-block-language">{language}</span>
        </div>
      )}
      <pre className={`code-block ${!language ? 'no-language' : ''}`}>
        <code
          ref={codeRef}
          className={`language-${prismLang}`}
        >
          {code}
        </code>
      </pre>
    </div>
  );
};

export default CodeBlock;

