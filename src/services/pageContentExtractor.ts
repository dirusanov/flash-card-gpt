import { PageContentContext, PageImage, FormulaElement, CodeBlock, LinkElement, PageMetadata } from './aiAgentService';

const IMAGE_SCAN_LIMIT = 24;
const SVG_SCAN_LIMIT = 12;
const CODE_SCAN_LIMIT = 24;
const INLINE_CODE_SCAN_LIMIT = 32;
const LINK_SCAN_LIMIT = 40;
const MATH_SCAN_LIMIT = 24;

export class PageContentExtractor {
    
    /**
     * Извлекает контент страницы относительно выделенного текста
     */
    static extractPageContent(selectedText: string, selectionElement?: Element): PageContentContext {
        const pageImages = this.extractImages(selectedText, selectionElement);
        const formulas = this.extractFormulas(selectedText, selectionElement);
        const codeBlocks = this.extractCodeBlocks(selectedText, selectionElement);
        const links = this.extractLinks(selectedText, selectionElement);
        const metadata = this.extractMetadata();

        return {
            selectedText,
            pageImages,
            formulas,
            codeBlocks,
            links,
            metadata
        };
    }

    // Асинхронная версия для загрузки внешних изображений
    static async extractPageContentAsync(selectedText: string, selectionElement?: Element): Promise<PageContentContext> {
        const pageImages = await this.extractImagesAsync(selectedText, selectionElement);
        const formulas = this.extractFormulas(selectedText, selectionElement);
        const codeBlocks = this.extractCodeBlocks(selectedText, selectionElement);
        const links = this.extractLinks(selectedText, selectionElement);
        const metadata = this.extractMetadata();

        return {
            selectedText,
            pageImages,
            formulas,
            codeBlocks,
            links,
            metadata
        };
    }

    /**
     * Извлекает изображения со страницы
     */
    private static extractImages(selectedText: string, selectionElement?: Element): PageImage[] {
        const images: PageImage[] = [];
        const root = this.getSearchRoot(selectionElement);
        const imgElements = Array.from(root.querySelectorAll('img')).slice(0, IMAGE_SCAN_LIMIT);
        
        imgElements.forEach((img, index) => {
            if (img.width < 30 || img.height < 30) {
                return;
            }
            
            if (!img.src) {
                return;
            }
            
            if (img.src.startsWith('data:image') && img.src.length > 5000) {
                return;
            }
            
            const isNearText = this.isElementNearSelection(img, selectionElement, selectedText);
            const relevanceScore = this.calculateImageRelevance(img, selectedText, isNearText);

            if (relevanceScore > 0.1) {
                images.push({
                    src: img.src,
                    alt: img.alt || img.title || '',
                    title: img.title,
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                    isNearText,
                    relevanceScore
                });
            }
        });

        const svgElements = Array.from(root.querySelectorAll('svg')).slice(0, SVG_SCAN_LIMIT);
        
        svgElements.forEach((svg, index) => {
            const width = svg.width.baseVal?.value || 0;
            const height = svg.height.baseVal?.value || 0;
            if (width < 30 || height < 30) {
                return;
            }
            
            const isNearText = this.isElementNearSelection(svg, selectionElement, selectedText);
            const relevanceScore = this.calculateSvgRelevance(svg, selectedText, isNearText);

            const src = relevanceScore > 0.1 ? this.svgToDataUrl(svg) : '';
            if (src) {
                images.push({
                    src,
                    alt: svg.getAttribute('aria-label') || svg.getAttribute('title') || 'SVG диаграмма',
                    width: width || 200,
                    height: height || 200,
                    isNearText,
                    relevanceScore
                });
            }
        });

        return images.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
    }

    /**
     * Асинхронно извлекает изображения со страницы с загрузкой внешних изображений
     */
    private static async extractImagesAsync(selectedText: string, selectionElement?: Element): Promise<PageImage[]> {
        const images: PageImage[] = [];
        const root = this.getSearchRoot(selectionElement);
        const imgElements = Array.from(root.querySelectorAll('img')).slice(0, IMAGE_SCAN_LIMIT);
        
        const imagePromises = Array.from(imgElements).map(async (img) => {
            if (img.width < 50 || img.height < 50) return null;
            
            if (!img.src || (img.src.startsWith('data:image') && img.src.length > 1000)) return null;
            
            const isNearText = this.isElementNearSelection(img, selectionElement, selectedText);
            const relevanceScore = this.calculateImageRelevance(img, selectedText, isNearText);
            
            if (relevanceScore <= 0.3) return null;

            return {
                src: img.src,
                alt: img.alt || img.title || '',
                title: img.title,
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                isNearText,
                relevanceScore
            };
        });

        const resolvedImages = await Promise.all(imagePromises);
        resolvedImages.forEach(img => {
            if (img) images.push(img);
        });
        
        const svgElements = Array.from(root.querySelectorAll('svg')).slice(0, SVG_SCAN_LIMIT);
        svgElements.forEach((svg) => {
            const width = svg.width.baseVal?.value || 0;
            const height = svg.height.baseVal?.value || 0;
            if (width < 50 || height < 50) return;
            
            const isNearText = this.isElementNearSelection(svg, selectionElement, selectedText);
            const relevanceScore = this.calculateSvgRelevance(svg, selectedText, isNearText);
            
            const src = relevanceScore > 0.3 ? this.svgToDataUrl(svg) : '';
            if (src) {
                images.push({
                    src,
                    alt: svg.getAttribute('aria-label') || svg.getAttribute('title') || 'SVG диаграмма',
                    width: width || 200,
                    height: height || 200,
                    isNearText,
                    relevanceScore
                });
            }
        });
        
        return images.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
    }

    /**
     * Извлекает математические формулы
     */
    private static extractFormulas(selectedText: string, selectionElement?: Element): FormulaElement[] {
        const formulas: FormulaElement[] = [];
        
        // MathJax формулы
        const root = this.getSearchRoot(selectionElement);
        const mathJaxElements = Array.from(root.querySelectorAll('.MathJax, .math, [class*="math"]')).slice(0, MATH_SCAN_LIMIT);
        mathJaxElements.forEach(element => {
            const formula = this.extractFormulaText(element);
            if (formula) {
                const isNearText = this.isElementNearSelection(element, selectionElement, selectedText);
                formulas.push({
                    text: formula,
                    type: this.detectFormulaType(element),
                    isNearText,
                    relevanceScore: this.calculateFormulaRelevance(formula, selectedText, isNearText)
                });
            }
        });

        // LaTeX формулы в тексте
        const latexPatterns = [
            /\$\$([^$]+)\$\$/g,  // блочные формулы
            /\$([^$]+)\$/g,      // инлайн формулы
            /\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g,  // блоки LaTeX
        ];

        const textContent = (root.textContent || '').slice(0, 50_000);
        latexPatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(textContent)) !== null) {
                const formula = match[1] || match[0];
                const isNearText = textContent.toLowerCase().includes(selectedText.toLowerCase());
                formulas.push({
                    text: formula,
                    type: pattern === latexPatterns[0] ? 'block' : 'inline',
                    isNearText,
                    relevanceScore: this.calculateFormulaRelevance(formula, selectedText, isNearText)
                });
            }
        });

        return formulas
            .filter(f => f.relevanceScore > 0.2)
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 3);
    }

    /**
     * Извлекает блоки кода
     */
    private static extractCodeBlocks(selectedText: string, selectionElement?: Element): CodeBlock[] {
        const codeBlocks: CodeBlock[] = [];
        
        // Блоки кода
        const root = this.getSearchRoot(selectionElement);
        const codeElements = Array.from(root.querySelectorAll('pre code, .highlight code, .code-block, .codehilite')).slice(0, CODE_SCAN_LIMIT);
        codeElements.forEach(element => {
            const code = element.textContent?.trim();
            if (code && code.length > 10 && code.length < 2000) {
                const isNearText = this.isElementNearSelection(element, selectionElement, selectedText);
                const language = this.detectCodeLanguage(element);
                
                codeBlocks.push({
                    code,
                    language,
                    isNearText,
                    relevanceScore: this.calculateCodeRelevance(code, selectedText, isNearText)
                });
            }
        });

        // Инлайн код
        const inlineCodeElements = Array.from(root.querySelectorAll('code:not(pre code)')).slice(0, INLINE_CODE_SCAN_LIMIT);
        inlineCodeElements.forEach(element => {
            const code = element.textContent?.trim();
            if (code && code.length > 3 && code.length < 100) {
                const isNearText = this.isElementNearSelection(element, selectionElement, selectedText);
                
                codeBlocks.push({
                    code,
                    language: 'inline',
                    isNearText,
                    relevanceScore: this.calculateCodeRelevance(code, selectedText, isNearText)
                });
            }
        });

        return codeBlocks
            .filter(cb => cb.relevanceScore > 0.3)
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 5);
    }

    /**
     * Извлекает ссылки
     */
    private static extractLinks(selectedText: string, selectionElement?: Element): LinkElement[] {
        const links: LinkElement[] = [];
        const root = this.getSearchRoot(selectionElement);
        const linkElements = Array.from(root.querySelectorAll('a[href]')).slice(0, LINK_SCAN_LIMIT);
        
        linkElements.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim();
            
            if (href && text && href.startsWith('http')) {
                const isNearText = this.isElementNearSelection(link, selectionElement, selectedText);
                const relevanceScore = this.calculateLinkRelevance(text, href, selectedText, isNearText);
                
                if (relevanceScore > 0.2) {
                    links.push({
                        url: href,
                        text,
                        isNearText,
                        relevanceScore
                    });
                }
            }
        });

        return links
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 3);
    }

    /**
     * Извлекает метаданные страницы
     */
    private static extractMetadata(): PageMetadata {
        return {
            url: window.location.href,
            title: document.title,
            domain: window.location.hostname,
            language: document.documentElement.lang || 'en',
            hasImages: document.querySelectorAll('img').length > 0,
            hasFormulas: document.querySelectorAll('.MathJax, .math, [class*="math"]').length > 0 ||
                        (document.body.textContent || '').includes('$'),
            hasCode: document.querySelectorAll('pre code, .highlight, .code-block').length > 0
        };
    }

    // Вспомогательные методы

    private static getSearchRoot(selectionElement?: Element): ParentNode {
        if (!selectionElement) {
            return document.body;
        }

        return (
            selectionElement.closest('article, main, section, [role="main"], .content, .article, .post') ||
            selectionElement.parentElement ||
            document.body
        );
    }

    private static isElementNearSelection(element: Element, selectionElement?: Element, selectedText?: string): boolean {
        if (!selectionElement) {
            // Если у нас нет элемента выделения, используем текстовый поиск
            const elementText = element.textContent || '';
            const parentText = element.parentElement?.textContent || '';
            return elementText.toLowerCase().includes((selectedText || '').toLowerCase()) ||
                   parentText.toLowerCase().includes((selectedText || '').toLowerCase());
        }

        // Проверяем расстояние между элементами
        const elementRect = element.getBoundingClientRect();
        const selectionRect = selectionElement.getBoundingClientRect();
        
        const distance = Math.sqrt(
            Math.pow(elementRect.left - selectionRect.left, 2) +
            Math.pow(elementRect.top - selectionRect.top, 2)
        );
        
        return distance < 500; // 500px считается "рядом"
    }

    private static calculateImageRelevance(img: HTMLImageElement, selectedText: string, isNearText: boolean): number {
        let score = 0.3; // Стартуем с базовым баллом 0.3 для всех изображений
        
        // Бонус за близость к тексту
        if (isNearText) score += 0.4;
        
        // Бонус за описательный alt текст
        const alt = (img.alt || '').toLowerCase();
        const text = selectedText.toLowerCase();
        
        if (alt.includes(text) || text.includes(alt)) score += 0.3;
        
        // Более либеральные критерии размеров
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        
        // Принимаем изображения от 50px и выше (в отличие от прежних 200px)
        if (width >= 50 && height >= 50) {
            score += 0.2;
        }
        
        // Только сильные штрафы за очевидные иконки
        if (alt.includes('icon') || alt.includes('logo') || width < 50 || height < 50) {
            score -= 0.2; // Уменьшили штраф
        }
        
        // Бонус за распространенные образовательные контексты
        if (alt.includes('diagram') || alt.includes('chart') || alt.includes('graph') || 
            alt.includes('figure') || alt.includes('схема') || alt.includes('диаграмма') ||
            alt.includes('рисунок') || alt.includes('изображение')) {
            score += 0.3;
        }
        return Math.max(0, Math.min(1, score));
    }

    private static calculateSvgRelevance(svg: SVGElement, selectedText: string, isNearText: boolean): number {
        let score = 0;
        
        if (isNearText) score += 0.5;
        
        // SVG обычно содержат диаграммы, что хорошо для обучения
        score += 0.3;
        
        // Проверяем наличие текста в SVG
        const svgText = svg.textContent || '';
        if (svgText.toLowerCase().includes(selectedText.toLowerCase()) || 
            selectedText.toLowerCase().includes(svgText.toLowerCase())) {
            score += 0.2;
        }
        
        return Math.max(0, Math.min(1, score));
    }

    private static calculateFormulaRelevance(formula: string, selectedText: string, isNearText: boolean): number {
        let score = 0;
        
        if (isNearText) score += 0.4;
        
        // Проверяем на наличие общих математических терминов
        const mathTerms = selectedText.toLowerCase().match(/\b(формула|уравнение|функция|интеграл|производная|матрица|вектор|логарифм|синус|косинус|тангенс|предел|сумма|произведение)\b/g);
        if (mathTerms && mathTerms.length > 0) score += 0.4;
        
        // Длинные формулы обычно более важные
        if (formula.length > 20) score += 0.2;
        
        return Math.max(0, Math.min(1, score));
    }

    private static calculateCodeRelevance(code: string, selectedText: string, isNearText: boolean): number {
        let score = 0;
        
        if (isNearText) score += 0.4;
        
        // Проверяем на наличие программистских терминов
        const progTerms = selectedText.toLowerCase().match(/\b(алгоритм|функция|метод|класс|переменная|массив|цикл|условие|код|программа|скрипт)\b/g);
        if (progTerms && progTerms.length > 0) score += 0.4;
        
        // Хорошо структурированный код получает бонус
        if (code.includes('\n') && code.includes('{') && code.includes('}')) score += 0.2;
        
        return Math.max(0, Math.min(1, score));
    }

    private static calculateLinkRelevance(linkText: string, href: string, selectedText: string, isNearText: boolean): number {
        let score = 0;
        
        if (isNearText) score += 0.3;
        
        // Проверяем релевантность текста ссылки
        if (linkText.toLowerCase().includes(selectedText.toLowerCase()) || 
            selectedText.toLowerCase().includes(linkText.toLowerCase())) {
            score += 0.4;
        }
        
        // Бонус за образовательные домены
        if (href.includes('wikipedia') || href.includes('edu') || href.includes('documentation')) {
            score += 0.3;
        }
        
        return Math.max(0, Math.min(1, score));
    }

    // btoa() only speaks Latin-1, so a diagram labelled in Cyrillic, Greek or CJK used to
    // throw InvalidCharacterError here — and since nothing between this and the message
    // handler caught it, one such SVG killed the whole page-context extraction. Encode the
    // markup as UTF-8 bytes first, and treat a still-unserialisable SVG as simply absent.
    private static svgToDataUrl(svg: SVGElement): string {
        try {
            const svgData = new XMLSerializer().serializeToString(svg);
            const bytes = new TextEncoder().encode(svgData);
            let binary = '';
            bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
            return `data:image/svg+xml;base64,${btoa(binary)}`;
        } catch {
            return '';
        }
    }

    private static extractFormulaText(element: Element): string | null {
        // Пробуем разные способы извлечения формулы
        const mathml = element.querySelector('math');
        if (mathml) {
            return mathml.textContent || mathml.innerHTML;
        }
        
        const latex = element.getAttribute('data-latex') || 
                     element.getAttribute('data-math') ||
                     element.textContent;
        
        return latex || null;
    }

    private static detectFormulaType(element: Element): 'latex' | 'mathml' | 'inline' | 'block' {
        if (element.querySelector('math')) return 'mathml';
        
        const className = element.className.toLowerCase();
        if (className.includes('display') || className.includes('block')) return 'block';
        if (className.includes('inline')) return 'inline';
        
        return 'latex';
    }

    private static detectCodeLanguage(element: Element): string | undefined {
        // Пробуем определить язык по классам
        const className = element.className;
        const langMatch = className.match(/language-(\w+)|lang-(\w+)|highlight-(\w+)/);
        if (langMatch) {
            return langMatch[1] || langMatch[2] || langMatch[3];
        }
        
        // Пробуем по атрибутам
        const dataLang = element.getAttribute('data-lang') || 
                         element.getAttribute('data-language');
        if (dataLang) return dataLang;
        
        // Пробуем угадать по содержимому
        const code = element.textContent || '';
        if (code.includes('function') && code.includes('{')) return 'javascript';
        if (code.includes('def ') && code.includes(':')) return 'python';
        if (code.includes('#include') || code.includes('int main')) return 'cpp';
        if (code.includes('public class') || code.includes('System.out')) return 'java';
        
        return undefined;
    }
}
