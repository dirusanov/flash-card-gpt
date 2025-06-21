import { PageContentContext, PageImage, FormulaElement, CodeBlock, LinkElement, PageMetadata } from './aiAgentService';

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
        console.log('🔍 Асинхронно извлекаем контент страницы...');
        
        const pageImages = await this.extractImagesAsync(selectedText, selectionElement);
        const formulas = this.extractFormulas(selectedText, selectionElement);
        const codeBlocks = this.extractCodeBlocks(selectedText, selectionElement);
        const links = this.extractLinks(selectedText, selectionElement);
        const metadata = this.extractMetadata();

        console.log('📄 Асинхронная экстракция завершена:', {
            images: pageImages.length,
            formulas: formulas.length,
            codeBlocks: codeBlocks.length,
            links: links.length
        });

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
        const imgElements = document.querySelectorAll('img');
        
        console.log(`🔍 Найдено ${imgElements.length} изображений на странице`);
        
        imgElements.forEach((img, index) => {
            // Пропускаем ТОЛЬКО очень маленькие изображения (возможно, это иконки)
            if (img.width < 30 || img.height < 30) {
                console.log(`⏭️ Пропускаем маленькое изображение ${index}: ${img.width}x${img.height}`);
                return;
            }
            
            // Пропускаем изображения без src или с очень длинными data URLs
            if (!img.src) {
                console.log(`⏭️ Пропускаем изображение ${index}: нет src`);
                return;
            }
            
            if (img.src.startsWith('data:image') && img.src.length > 5000) {
                console.log(`⏭️ Пропускаем изображение ${index}: слишком длинный data URL`);
                return;
            }
            
            const isNearText = this.isElementNearSelection(img, selectionElement, selectedText);
            const relevanceScore = this.calculateImageRelevance(img, selectedText, isNearText);
            
            console.log(`🖼️ Изображение ${index}:`, {
                src: img.src.substring(0, 50) + '...',
                alt: img.alt,
                size: `${img.width}x${img.height}`,
                isNearText,
                relevanceScore,
                willInclude: relevanceScore > 0.1  // Понижаем порог!
            });
            
            // КРИТИЧНО: Понижаем порог до 0.1 для включения больше изображений
            if (relevanceScore > 0.1) {
                const base64 = this.convertImageToBase64(img);
                images.push({
                    src: img.src,
                    alt: img.alt || img.title || '',
                    title: img.title,
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                    isNearText,
                    relevanceScore,
                    base64
                });
                console.log(`✅ Добавлено изображение ${index} (score: ${relevanceScore})`);
            } else {
                console.log(`❌ Изображение ${index} не прошло порог (score: ${relevanceScore})`);
            }
        });

        // Также ищем изображения в SVG
        const svgElements = document.querySelectorAll('svg');
        console.log(`🔍 Найдено ${svgElements.length} SVG элементов`);
        
        svgElements.forEach((svg, index) => {
            const width = svg.width.baseVal?.value || 0;
            const height = svg.height.baseVal?.value || 0;
            if (width < 30 || height < 30) {
                console.log(`⏭️ Пропускаем маленький SVG ${index}: ${width}x${height}`);
                return;
            }
            
            const isNearText = this.isElementNearSelection(svg, selectionElement, selectedText);
            const relevanceScore = this.calculateSvgRelevance(svg, selectedText, isNearText);
            
            console.log(`🎨 SVG ${index}:`, {
                size: `${width}x${height}`,
                isNearText,
                relevanceScore,
                willInclude: relevanceScore > 0.1
            });
            
            if (relevanceScore > 0.1) {  // Понижаем порог и для SVG
                images.push({
                    src: this.svgToDataUrl(svg),
                    alt: svg.getAttribute('aria-label') || svg.getAttribute('title') || 'SVG диаграмма',
                    width: width || 200,
                    height: height || 200,
                    isNearText,
                    relevanceScore,
                    base64: this.svgToDataUrl(svg)
                });
                console.log(`✅ Добавлен SVG ${index} (score: ${relevanceScore})`);
            }
        });

        let finalImages = images.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 10);  // Увеличиваем до 10 изображений
        
        // АВАРИЙНАЯ ЛОГИКА: Если не найдено изображений, берем все подходящие
        if (finalImages.length === 0) {
            console.log('🚨 Не найдено релевантных изображений, применяем аварийную логику');
            const allImages: PageImage[] = [];
            
            imgElements.forEach((img, index) => {
                // Берем ВСЕ изображения размером больше 30px
                if (img.width >= 30 && img.height >= 30 && img.src) {
                    const base64 = this.convertImageToBase64(img);
                    allImages.push({
                        src: img.src,
                        alt: img.alt || img.title || `Изображение ${index + 1}`,
                        title: img.title,
                        width: img.naturalWidth || img.width,
                        height: img.naturalHeight || img.height,
                        isNearText: false,
                        relevanceScore: 0.5, // Устанавливаем средний балл
                        base64
                    });
                }
            });
            
            finalImages = allImages.slice(0, 5); // Берем максимум 5 для аварийного режима
            console.log(`🎯 АВАРИЙНЫЙ РЕЖИМ: Добавлено ${finalImages.length} изображений`);
        }
        
        console.log(`🎯 Финальный результат: ${finalImages.length} изображений из ${images.length} найденных`);
        
        return finalImages;
    }

    /**
     * Асинхронно извлекает изображения со страницы с загрузкой внешних изображений
     */
    private static async extractImagesAsync(selectedText: string, selectionElement?: Element): Promise<PageImage[]> {
        const images: PageImage[] = [];
        const imgElements = document.querySelectorAll('img');
        
        // Обрабатываем изображения асинхронно
        const imagePromises = Array.from(imgElements).map(async (img) => {
            // Пропускаем маленькие декоративные изображения
            if (img.width < 50 || img.height < 50) return null;
            
            // Пропускаем изображения без src
            if (!img.src || (img.src.startsWith('data:image') && img.src.length > 1000)) return null;
            
            const isNearText = this.isElementNearSelection(img, selectionElement, selectedText);
            const relevanceScore = this.calculateImageRelevance(img, selectedText, isNearText);
            
            // Отбираем только релевантные изображения
            if (relevanceScore <= 0.3) return null;

            let base64: string | undefined;
            
            // Для внешних изображений загружаем асинхронно
            if (img.src.startsWith('http') && !img.src.includes(window.location.origin)) {
                console.log('🖼️ Загружаем внешнее изображение:', img.src);
                base64 = await this.fetchImageAsBase64(img.src);
            } else {
                // Для локальных изображений используем обычную конвертацию
                base64 = this.convertImageToBase64(img);
            }

            return {
                src: img.src,
                alt: img.alt || img.title || '',
                title: img.title,
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                isNearText,
                relevanceScore,
                base64
            };
        });

        // Ждем завершения всех операций загрузки
        const resolvedImages = await Promise.all(imagePromises);
        
        // Фильтруем null результаты
        resolvedImages.forEach(img => {
            if (img) images.push(img);
        });
        
        // Также ищем изображения в SVG (синхронно, так как они уже на странице)
        const svgElements = document.querySelectorAll('svg');
        svgElements.forEach((svg) => {
            const width = svg.width.baseVal?.value || 0;
            const height = svg.height.baseVal?.value || 0;
            if (width < 50 || height < 50) return;
            
            const isNearText = this.isElementNearSelection(svg, selectionElement, selectedText);
            const relevanceScore = this.calculateSvgRelevance(svg, selectedText, isNearText);
            
            if (relevanceScore > 0.3) {
                images.push({
                    src: this.svgToDataUrl(svg),
                    alt: svg.getAttribute('aria-label') || svg.getAttribute('title') || 'SVG диаграмма',
                    width: width || 200,
                    height: height || 200,
                    isNearText,
                    relevanceScore,
                    base64: this.svgToDataUrl(svg) // SVG уже в base64 формате
                });
            }
        });

        console.log(`🖼️ Найдено ${images.length} релевантных изображений (включая ${images.filter(img => img.base64).length} с base64)`);
        
        return images.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
    }

    /**
     * Извлекает математические формулы
     */
    private static extractFormulas(selectedText: string, selectionElement?: Element): FormulaElement[] {
        const formulas: FormulaElement[] = [];
        
        // MathJax формулы
        const mathJaxElements = document.querySelectorAll('.MathJax, .math, [class*="math"]');
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

        const textContent = document.body.textContent || '';
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
        const codeElements = document.querySelectorAll('pre code, .highlight code, .code-block, .codehilite');
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
        const inlineCodeElements = document.querySelectorAll('code:not(pre code)');
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
        const linkElements = document.querySelectorAll('a[href]');
        
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
        
        console.log(`📊 Relevance calculation for image:`, {
            alt: alt.substring(0, 30),
            size: `${width}x${height}`,
            isNearText,
            finalScore: Math.max(0, Math.min(1, score))
        });
        
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

    private static convertImageToBase64(img: HTMLImageElement): string | undefined {
        try {
            // Проверяем, что изображение загружено
            if (!img.complete || img.naturalWidth === 0) {
                console.warn('Image not loaded yet:', img.src);
                return undefined;
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return undefined;
            
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            
            // Заливаем фон белым цветом для корректной конвертации PNG с прозрачностью
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Рисуем изображение поверх белого фона
            ctx.drawImage(img, 0, 0);
            
            // Используем PNG для лучшего качества, особенно для диаграмм и схем
            return canvas.toDataURL('image/png', 1.0);
        } catch (error) {
            console.warn('Could not convert image to base64:', error);
            return undefined;
        }
    }

    // Асинхронная загрузка внешних изображений и конвертация в base64
    private static async fetchImageAsBase64(url: string): Promise<string | undefined> {
        try {
            console.log('🖼️ Загружаем внешнее изображение:', url);
            
            // Создаем новое изображение для загрузки
            const img = new Image();
            img.crossOrigin = 'anonymous'; // Для CORS
            
            return new Promise((resolve) => {
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            resolve(undefined);
                            return;
                        }
                        
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        
                        // Заливаем фон белым цветом для корректной конвертации
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        
                        // Рисуем изображение поверх белого фона
                        ctx.drawImage(img, 0, 0);
                        
                        const base64 = canvas.toDataURL('image/png', 1.0);
                        console.log('✅ Изображение успешно конвертировано в base64');
                        resolve(base64);
                    } catch (error) {
                        console.warn('Ошибка при конвертации изображения:', error);
                        resolve(undefined);
                    }
                };
                
                img.onerror = () => {
                    console.warn('Ошибка загрузки изображения:', url);
                    resolve(undefined);
                };
                
                img.src = url;
            });
        } catch (error) {
            console.warn('Failed to fetch image as base64:', error);
            return undefined;
        }
    }

    private static svgToDataUrl(svg: SVGElement): string {
        const svgData = new XMLSerializer().serializeToString(svg);
        return `data:image/svg+xml;base64,${btoa(svgData)}`;
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