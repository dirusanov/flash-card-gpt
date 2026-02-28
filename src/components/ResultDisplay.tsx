import React, { useState, useEffect } from 'react';
import { FaCheck, FaList, FaPen, FaTrash, FaPlus, FaTimes, FaEdit, FaSave, FaSync, FaChevronDown, FaChevronUp, FaBook, FaInfoCircle, FaVolumeUp } from 'react-icons/fa';
import { FaLanguage, FaGraduationCap, FaBookOpen, FaQuoteRight, FaTags } from 'react-icons/fa';
import { Modes } from "../constants";
import Loader from './Loader';
import { processLatexInContent } from '../utils/katexRenderer';
import MathContentRenderer from './MathContentRenderer';
import GrammarCard from './grammar/GrammarCard';
import { getLoadingMessage, getDetailedLoadingMessage, type LoadingMessage, type DetailedLoadingMessage } from '../services/loadingMessages';

interface ResultDisplayProps {
    front: string | null
    back?: string | null; // Add back field for General mode
    translation: string | null;
    examples: Array<[string, string | null]>;
    examplesAudio?: Array<string | null>;
    imageUrl: string | null;
    image: string | null;
    linguisticInfo?: string;
    transcription: string | null;
    wordAudio?: string | null;
    onNewImage: () => void;
    onNewExamples: () => void;
    onGenerateAudio?: () => void;
    onAccept: () => void;
    onViewSavedCards: () => void;
    onCancel?: () => void;
    loadingNewImage: boolean;
    loadingNewExamples: boolean;
    loadingAudio?: boolean;
    loadingAccept: boolean;
    loadingGetResult?: boolean;
    mode?: Modes; 
    shouldGenerateImage?: boolean;
    isSaved?: boolean;
    isEdited?: boolean;
    isGeneratingCard?: boolean;
    setTranslation?: (translation: string) => void;
    setBack?: (back: string) => void; // Add setter for back field
    setExamples?: (examples: Array<[string, string | null]>) => void;
    setLinguisticInfo?: (info: string) => void;
    hideActionButtons?: boolean; // Hide action buttons in preview mode
    createdAt?: Date; // Add creation time support
}

// Функция для рендеринга простого Markdown (изображения, формулы, код)
const renderMarkdownContent = (content: string): string => {
    let html = content;
    
    // Конвертируем изображения из Markdown в HTML
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
        // Улучшенная логика для alt текста
        const displayAlt = alt && alt !== 'Изображение' && alt !== 'Image' ? alt : '';
        
        return `<div class="my-1 text-center">
            <img src="${src}" alt="${displayAlt}" class="mx-auto block h-auto max-w-full rounded shadow-sm" />
            ${displayAlt ? `<div class="mt-0.5 text-[11px] italic text-gray-500">${displayAlt}</div>` : ''}
        </div>`;
    });
    
    // Обрабатываем LaTeX формулы с помощью KaTeX
    html = processLatexInContent(html);
    
    // Конвертируем блоки кода
    html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, language, code) => {
        return `<div class="my-3">
            <div class="overflow-x-auto whitespace-pre rounded-md bg-zinc-800 p-3 font-mono text-[13px] text-zinc-100">
                ${language ? `<div class="mb-2 text-[11px] text-zinc-400">${language}</div>` : ''}
                ${code}
            </div>
        </div>`;
    });
    
    // Конвертируем инлайн код
    html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-gray-100 px-1 py-0.5 font-mono text-[13px]">$1</code>');
    
    // Конвертируем переносы строк
    html = html.replace(/\n/g, '<br />');
    
    return html;
};

const ResultDisplay: React.FC<ResultDisplayProps> = (
        {
            front,
            back,
            translation,
            examples,
            examplesAudio = [],
            imageUrl,
            image,
            linguisticInfo,
            transcription,
            wordAudio = null,
            onNewImage,
            onNewExamples,
            onGenerateAudio,
            onAccept,
            onViewSavedCards,
            onCancel,
            mode = Modes.LanguageLearning,
            loadingNewImage,
            loadingNewExamples,
            loadingAudio = false,
            loadingAccept,
            loadingGetResult = false,
            shouldGenerateImage = true,
            isSaved = false,
            isEdited = false,
            isGeneratingCard,
            setTranslation,
            setBack,
            setExamples,
            setLinguisticInfo,
            hideActionButtons = false,
            createdAt
        }
    ) => {
    
    const [isEditingTranslation, setIsEditingTranslation] = useState(false);
    const [localTranslation, setLocalTranslation] = useState(translation || '');
    const [isEditingBack, setIsEditingBack] = useState(false);
    const [localBack, setLocalBack] = useState(back || '');
    const [isEditMode, setIsEditMode] = useState(false);
    const [expandedExamples, setExpandedExamples] = useState(true);
    const [expandedLinguistics, setExpandedLinguistics] = useState(true);
    const hasMissingExamplesAudio = examples.some((_example, index) => !examplesAudio[index]);
    const hasMissingAnyAudio = !wordAudio || hasMissingExamplesAudio;

    // Loading messages states
    const [currentImageLoadingMessage, setCurrentImageLoadingMessage] = useState<DetailedLoadingMessage | null>(null);
    const [currentExamplesLoadingMessage, setCurrentExamplesLoadingMessage] = useState<DetailedLoadingMessage | null>(null);
    const [currentAcceptLoadingMessage, setCurrentAcceptLoadingMessage] = useState<DetailedLoadingMessage | null>(null);

    // Синхронизируем локальные состояния с пропсами
    useEffect(() => {
        setLocalTranslation(translation || '');
    }, [translation]);

    useEffect(() => {
        setLocalBack(back || '');
    }, [back]);

    // Update loading messages based on loading states
    useEffect(() => {
        if (loadingNewImage) {
            setCurrentImageLoadingMessage(getDetailedLoadingMessage('GENERATING_IMAGE', 1));
        } else {
            setCurrentImageLoadingMessage(null);
        }
    }, [loadingNewImage]);

    useEffect(() => {
        if (loadingNewExamples) {
            setCurrentExamplesLoadingMessage(getDetailedLoadingMessage('GENERATING_EXAMPLES', 1));
        } else {
            setCurrentExamplesLoadingMessage(null);
        }
    }, [loadingNewExamples]);

    useEffect(() => {
        if (loadingAccept) {
            setCurrentAcceptLoadingMessage(getDetailedLoadingMessage('SAVING_TO_ANKI', 1));
        } else {
            setCurrentAcceptLoadingMessage(null);
        }
    }, [loadingAccept]);

    useEffect(() => {
        setLinguisticInfoValue(linguisticInfo || '');
    }, [linguisticInfo]);

    // Включить режим редактирования
    const enableEditMode = () => {
        setIsEditMode(true);
    };

    // Выключить режим редактирования и сохранить изменения
    const disableEditMode = () => {
        // Сохраняем все локальные изменения перед выходом из режима редактирования
        
        // 1. Сохраняем изменения в переводе
        if (isEditingTranslation && setTranslation) {
            setTranslation(localTranslation);
            setIsEditingTranslation(false);
        }
        
        // 2. Сохраняем изменения в back поле (для General mode)
        if (isEditingBack && setBack) {
            setBack(localBack);
            setIsEditingBack(false);
        }
        
        // 3. Сохраняем изменения в примерах (если редактируется пример)
        if (editingExampleIndex !== null && setExamples) {
            const newExamples = [...examples];
            newExamples[editingExampleIndex] = [editingExampleOriginal, editingExampleTranslated];
            setExamples(newExamples);
            setEditingExampleIndex(null);
        }
        
        // 4. Сохраняем изменения в лингвистической информации
        if (linguisticInfoEditable && setLinguisticInfo) {
            setLinguisticInfo(linguisticInfoValue);
            setLinguisticInfoEditable(false);
        }
        
        // 5. Для уже сохраненных карточек автоматически сохраняем изменения
        if (isSaved) {
            onAccept();
        }
        
        // 6. Выходим из режима редактирования
        setIsEditMode(false);
    };

    // Handle translation edit
    const handleTranslationEdit = () => {
        if (!isEditMode) return;
        setIsEditingTranslation(true);
        setLocalTranslation(translation || '');
    };

    const handlePlayAudio = async () => {
        if (!wordAudio) return;
        try {
            const audio = new Audio(wordAudio);
            await audio.play();
        } catch (error) {
            console.warn('Failed to play word audio:', error);
        }
    };

    const handlePlayExampleAudio = async (index: number) => {
        const audioUrl = examplesAudio[index];
        if (!audioUrl) return;
        try {
            const audio = new Audio(audioUrl);
            await audio.play();
        } catch (error) {
            console.warn('Failed to play example audio:', error);
        }
    };

    const handleTranslationSave = () => {
        if (setTranslation) {
            setTranslation(localTranslation);
        }
        setIsEditingTranslation(false);
    };

    // Handle back field edit
    const handleBackEdit = () => {
        if (!isEditMode) return;
        setIsEditingBack(true);
        setLocalBack(back || '');
    };

    const handleBackSave = () => {
        if (setBack) {
            setBack(localBack);
        }
        setIsEditingBack(false);
    };

    // Handle example edit
    const handleExampleEdit = (index: number, isExample: boolean, value: string) => {
        if (!isEditMode) return;
        if (setExamples && examples) {
            // Явно указываем тип для newExamples
            const newExamples: Array<[string, string | null]> = [...examples];
            if (isExample) {
                // Первый элемент всегда строка
                newExamples[index][0] = value;
            } else {
                // Второй элемент может быть строкой или null
                newExamples[index][1] = value || null;
            }
            setExamples(newExamples);
        }
    };

    // Handle deleting an example
    const handleDeleteExample = (index: number) => {
        if (!isEditMode) return;
        if (setExamples && examples) {
            // Явно указываем тип для newExamples
            const newExamples: Array<[string, string | null]> = [...examples];
            newExamples.splice(index, 1);
            setExamples(newExamples);
        }
    };

    // Handle adding a new example
    const handleAddExample = () => {
        if (!isEditMode) return;
        if (setExamples && examples) {
            // Использование правильного типа кортежа [string, string | null]
            const newExamples: Array<[string, string | null]> = [...examples];
            // Добавление нового примера с корректной структурой кортежа
            newExamples.push(['', null]);
            setExamples(newExamples);
        }
    };

    // Рендер кнопки редактирования/сохранения
    const renderEditSaveButton = () => {
        // Если карточка в режиме редактирования, показываем кнопку "Save and Finish"
        if (isEditMode) {
            return (
                <button
                    onClick={disableEditMode}
                    disabled={loadingAccept}
                    className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-500 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                    <FaSave size={14} />
                    {loadingAccept ?
    <div className="flex items-center justify-center gap-1.5">
        <Loader type="spinner" size="small" inline color="#ffffff" />
        <span className="text-xs font-medium">
            {currentAcceptLoadingMessage?.currentStepTitle || currentAcceptLoadingMessage?.title || 'Saving'}
        </span>
    </div> : (isSaved ? 'Save & Finish Editing' : 'Finish Editing')}
                </button>
            );
        }

        // Кнопка редактирования появляется для всех карточек (и сохраненных, и несохраненных)
        if (!isEditMode) {
            return (
                <button
                    onClick={enableEditMode}
                    className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800"
                >
                    <FaEdit size={14} />
                    Edit Card
                </button>
            );
        }

        return null;
    };

    // Рендерим подсказку для редактирования в режиме редактирования
    const renderEditingHint = () => {
        if (!isEditMode) return null;
        
        return (
            <div className="mb-4 rounded-md border border-blue-100 bg-blue-50 p-2.5 text-[13px] text-blue-800">
                <div className="mb-1.5 flex items-center gap-2 font-semibold">
                    <FaEdit size={12} />
                    Editing Mode
                </div>
                <p className="m-0 text-xs">
                    Click on text elements to edit them. When finished, click "{isSaved ? 'Save & Finish Editing' : 'Finish Editing'}" at the top of the card.
                </p>
            </div>
        );
    }

    const [translationEditable, setTranslationEditable] = useState(false);
    const [translationValue, setTranslationValue] = useState(translation || '');
    
    const handleTranslationChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setTranslationValue(e.target.value);
    };

    const handleTranslationCancel = () => {
        setTranslationValue(translation || '');
        setTranslationEditable(false);
    };

    const [editingExampleIndex, setEditingExampleIndex] = useState<number | null>(null);
    const [editingExampleOriginal, setEditingExampleOriginal] = useState('');
    const [editingExampleTranslated, setEditingExampleTranslated] = useState('');
    
    const startEditingExample = (index: number) => {
        setEditingExampleIndex(index);
        setEditingExampleOriginal(examples[index][0]);
        setEditingExampleTranslated(examples[index][1] || '');
    };

    const cancelEditingExample = () => {
        setEditingExampleIndex(null);
    };

    const saveEditingExample = () => {
        if (editingExampleIndex !== null && setExamples) {
            const newExamples = [...examples];
            newExamples[editingExampleIndex] = [editingExampleOriginal, editingExampleTranslated];
            setExamples(newExamples);
            setEditingExampleIndex(null);
        }
    };

    const [linguisticInfoEditable, setLinguisticInfoEditable] = useState(false);
    const [linguisticInfoValue, setLinguisticInfoValue] = useState(linguisticInfo || '');
    
    const handleLinguisticInfoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLinguisticInfoValue(e.target.value);
    };
    
    const handleLinguisticInfoSave = () => {
        if (setLinguisticInfo) {
            setLinguisticInfo(linguisticInfoValue);
        }
        setLinguisticInfoEditable(false);
    };
    
    const handleLinguisticInfoCancel = () => {
        setLinguisticInfoValue(linguisticInfo || '');
        setLinguisticInfoEditable(false);
    };

    return (
        <div className={`w-full max-w-full overflow-x-hidden rounded-lg border-l-4 p-4 shadow ${isEditMode ? 'border-l-blue-500 bg-zinc-50' : 'border-l-transparent bg-white'}`}>
            {/* Status indicator with creation time - improved and more intuitive */}
            <div className={`mb-3 flex flex-col items-end gap-1 rounded border px-2 py-1.5 text-right text-[10px] ${isEditMode ? 'border-blue-100 bg-blue-50 text-blue-800' : isSaved ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-gray-100 bg-gray-50 text-gray-500'}`}>
                <div className="flex items-center gap-1">
                    <span className={`inline-block h-2 w-2 rounded-full ${isEditMode ? 'bg-blue-500' : isSaved ? 'bg-emerald-500' : 'bg-gray-500'}`}></span>
                    <strong className={`${isEditMode ? 'text-blue-900' : isSaved ? 'text-emerald-600' : 'text-gray-600'}`}>{isEditMode 
                        ? 'Editing' 
                        : (isSaved 
                            ? 'Saved to Collection'
                            : 'New - Not Saved Yet')}
                    </strong>
                </div>
                {/* Creation time */}
                <div className="flex items-center gap-1 text-[9px] italic text-gray-400">
                    <span>📅</span>
                    {(createdAt || new Date()).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </div>
            </div>

            {/* Кнопка редактирования/сохранения - показывается вверху карточки */}
            {renderEditSaveButton()}
            
            {/* Подсказка для редактирования */}
            {renderEditingHint()}

            {front && (
                <div className="mb-3">
                    {/* Для GeneralTopic или если похоже на формулы — используем MathContentRenderer */}
                    {(mode === Modes.GeneralTopic || /\\(frac|sqrt|sum|int|prod|log|ln|sin|cos|tan|cot|arctan|arcsin|arccos|sinh|cosh|tanh)\b|\$|\\\[|\\\(|\)|\[|\]/.test(front)) ? (
                        <div className="rounded-lg bg-gray-100 p-2.5 text-left">
                            <MathContentRenderer
                                content={front}
                                enableAI={true}
                                className="text-base text-gray-900"
                            />
                        </div>
                    ) : front.includes("/") ? (
                        // Если это слово/транскрипция
                        (() => {
                            const parts = front.split(/\s*\//)
                            const wordPart = parts[0]?.trim() || ''
                            const pronunciation = parts.length > 1 ? `/${parts.slice(1).join('/').replace(/\/$/, '')}` : ''
                            return (
                                <div className="rounded-lg bg-gray-100 p-3 text-center">
                                    <h3 className="m-0 mb-1.5 text-xl font-bold text-gray-900">{wordPart}</h3>
                                    {pronunciation && (
                                        <div className="text-sm italic text-gray-500">{pronunciation}</div>
                                    )}
                                </div>
                            )
                        })()
                    ) : (
                        <h3 className="my-0.5 rounded-lg bg-gray-100 p-2.5 text-center text-lg font-semibold text-gray-900">{front}</h3>
                    )}
                </div>
            )}
            
            {/* Транскрипция - отображается между словом и переводом */}
            {transcription && (
                <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                    <div 
                        className="text-sm leading-relaxed text-slate-600"
                        dangerouslySetInnerHTML={{
                            __html: transcription
                        }}
                    />
                </div>
            )}

            {(mode === Modes.LanguageLearning && (wordAudio || onGenerateAudio)) && (
                <div className="mb-3 flex justify-center gap-2">
                    {wordAudio && (
                        <button
                            onClick={handlePlayAudio}
                            className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-full border border-blue-300 bg-gradient-to-b from-sky-50 to-blue-100 text-blue-900 shadow-sm"
                            title="Play pronunciation audio"
                        >
                            <FaVolumeUp size={14} />
                        </button>
                    )}
                    {onGenerateAudio && hasMissingAnyAudio && (
                        <button
                            onClick={onGenerateAudio}
                            disabled={loadingAudio}
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100"
                            title="Generate missing audio for word and examples"
                        >
                            {loadingAudio ? 'Generating audio...' : 'Generate audio'}
                        </button>
                    )}
                </div>
            )}
            
            {/* Display translation for Language Learning mode or back for General mode */}
            {(mode === Modes.LanguageLearning ? translation : back) && (
                <>
                    <hr className="my-2.5 border-0 border-t border-gray-200" />
                    
                    {/* Editing mode for translation (Language Learning) or back (General) */}
                    {(mode === Modes.LanguageLearning ? isEditingTranslation : isEditingBack) && isEditMode ? (
                        <div className="relative mb-3">
                            {mode === Modes.LanguageLearning ? (
                                <input
                                    type="text"
                                    value={localTranslation}
                                    onChange={(e) => setLocalTranslation(e.target.value)}
                                    className="w-full rounded-md border border-blue-500 bg-white px-3 py-2 text-center text-sm font-semibold text-gray-900 outline-none"
                                    autoFocus
                                    onBlur={handleTranslationSave}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleTranslationSave();
                                        }
                                    }}
                                />
                            ) : (
                                <textarea
                                    value={localBack}
                                    onChange={(e) => setLocalBack(e.target.value)}
                                    className="min-h-[120px] w-full resize-y rounded-md border border-blue-500 bg-white p-3 text-sm font-normal leading-6 text-gray-900 outline-none"
                                    autoFocus
                                    onBlur={handleBackSave}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.ctrlKey) {
                                            handleBackSave();
                                        }
                                    }}
                                />
                            )}
                            <div className="mt-1 text-center text-[11px] text-gray-500">
                                {mode === Modes.LanguageLearning 
                                    ? 'Press Enter or click outside to save'
                                    : 'Press Ctrl+Enter or click outside to save'
                                }
                            </div>
                        </div>
                    ) : (
                        <div
                        className={`relative mb-3 ${mode === Modes.LanguageLearning ? 'text-center' : 'text-left'} ${isEditMode ? 'cursor-pointer rounded border border-dashed border-gray-200 bg-zinc-50 p-2 pr-6 transition-colors hover:border-blue-500 hover:bg-gray-50' : ''}`}
                        onClick={isEditMode ? (mode === Modes.LanguageLearning ? handleTranslationEdit : handleBackEdit) : undefined}
                        >
                            {mode === Modes.LanguageLearning ? (
                                <p className="m-0 text-sm font-semibold text-gray-900">{translation}</p>
                            ) : (
                                <MathContentRenderer
                                    content={back || ''}
                                    enableAI={true}
                                    className="m-0 text-sm leading-relaxed text-gray-900"
                                />
                            )}
                            
                            {isEditMode && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); // Предотвращаем всплытие события
                                        mode === Modes.LanguageLearning ? handleTranslationEdit() : handleBackEdit();
                                    }}
                                    className="absolute right-2 top-1/2 flex -translate-y-1/2 cursor-pointer rounded bg-gray-100 p-1 text-gray-500 shadow-sm transition-colors hover:bg-gray-200 hover:text-blue-500"
                                    title={mode === Modes.LanguageLearning ? "Edit translation" : "Edit content"}
                                >
                                    <FaPen size={12} />
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
            
            {/* Лингвистическая справка сразу после перевода */}
            {linguisticInfo && (
                <div className={`mb-4 mt-3 overflow-hidden rounded-[10px] border shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all duration-300 ${expandedLinguistics ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                    {/* Заголовок секции с разделенной логикой клика */}
                    <div 
                        className={`flex items-center justify-between px-4 py-3 transition-colors ${expandedLinguistics ? 'border-b border-blue-200' : ''}`}
                    >
                        <div className={`flex flex-1 items-center gap-2.5 text-sm font-semibold ${expandedLinguistics ? 'text-blue-700' : 'text-gray-600'}`}>
                            <FaGraduationCap size={16} className={expandedLinguistics ? 'text-blue-600' : 'text-gray-500'} />
                            <span>Grammar & Linguistics</span>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setExpandedLinguistics(!expandedLinguistics);
                            }}
                            className="flex items-center justify-center rounded p-1 transition-colors hover:bg-black/5"
                        >
                            {expandedLinguistics ? 
                                <FaChevronUp size={14} className="text-gray-500" /> : 
                                <FaChevronDown size={14} className="text-gray-500" />
                            }
                        </button>
                    </div>
                    
                    {/* Содержимое раздела без onClick */}
                    {expandedLinguistics && (
                        <div className="p-4">
                            {linguisticInfoEditable ? (
                                <div className="w-full">
                                    <textarea
                                        value={linguisticInfoValue}
                                        onChange={handleLinguisticInfoChange}
                                        className="mb-2 min-h-[120px] w-full resize-y rounded-md border border-gray-200 px-3 py-2.5 text-sm leading-6"
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={handleLinguisticInfoCancel}
                                            className="cursor-pointer rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-200"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleLinguisticInfoSave}
                                            className="cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-[13px] text-white hover:bg-blue-700"
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="relative">
                                    <GrammarCard 
                                        content={linguisticInfo || ''} 
                                        isEditable={isEditMode} 
                                        onEditClick={() => setLinguisticInfoEditable(true)} 
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            {examples.length > 0 && (
                <>
                    <hr className="my-2.5 border-0 border-t border-gray-200" />
                    <div className="mb-3">
                        <div className="mb-2 flex items-center justify-between">
                            <h4 className="m-0 text-sm font-semibold text-gray-700">Examples</h4>
                        </div>
                        
                        <ul className="m-0 flex list-none flex-col gap-2 p-0">
                            {examples.map(([example, translatedExample], index) => (
                                <li key={index} className={`relative min-h-0 break-words overflow-visible rounded-md bg-gray-50 p-3 ${isEditMode ? 'border border-dashed border-slate-300 shadow-sm' : ''}`}>
                                    {isEditMode && (
                                        <div className="absolute right-2 top-2 z-[5] flex gap-2">
                                            <button
                                                onClick={() => handleDeleteExample(index)}
                                                className="flex cursor-pointer items-center justify-center rounded bg-red-100 px-1.5 py-1 text-[11px] font-medium text-red-500 hover:bg-red-200"
                                                title="Delete example"
                                            >
                                                <FaTrash size={10} className="mr-1" />
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                    
                                    {isEditMode ? (
                                        <>
                                            <div className="mb-2">
                                                <textarea
                                                    value={example}
                                                    onChange={(e) => handleExampleEdit(index, true, e.target.value)}
                                                    className="min-h-10 w-full resize-y rounded border border-gray-200 bg-white px-2 py-1.5 text-[13px] font-medium leading-6 text-gray-900"
                                                    placeholder="Example sentence"
                                                />
                                            </div>
                                            
                                            <div>
                                                <textarea
                                                    value={translatedExample || ''}
                                                    onChange={(e) => handleExampleEdit(index, false, e.target.value)}
                                                    className="min-h-10 w-full resize-y rounded border border-gray-200 bg-white px-2 py-1.5 text-[13px] italic leading-6 text-gray-500"
                                                    placeholder="Translation (optional)"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {!isEditMode && (
                                                <div className="mb-1.5 flex justify-end gap-1.5">
                                                    {examplesAudio[index] && (
                                                        <button
                                                            onClick={() => handlePlayExampleAudio(index)}
                                                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-blue-200 bg-gradient-to-b from-slate-50 to-blue-50 text-blue-900"
                                                            title="Play example audio"
                                                        >
                                                            <FaVolumeUp size={10} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            <div className={`break-words overflow-visible whitespace-normal text-[13px] font-medium leading-6 text-gray-900 ${translatedExample ? 'mb-1.5' : 'mb-0'}`}>
                                                {example}
                                            </div>
                                            {translatedExample && (
                                                <div className="break-words overflow-visible whitespace-normal text-[13px] italic leading-6 text-gray-500">
                                                    {translatedExample}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                        
                        {isEditMode && (
                            <button
                                onClick={handleAddExample}
                                className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-blue-200 bg-blue-50 px-2.5 py-2.5 text-sm font-medium text-blue-500 transition-colors hover:border-blue-300 hover:bg-blue-100"
                            >
                                <FaPlus size={12} />
                                Add Example
                            </button>
                        )}
                    </div>
                </>
            )}
            
            {(image || imageUrl) && (
                <>
                    <hr className="my-4 border-0 border-t border-gray-200" />
                    <div className="mb-4">
                        <img 
                            src={image || imageUrl || ''} 
                            alt="" 
                            className="w-full rounded-md shadow-sm" 
                        />
                    </div>
                </>
            )}
            
            {!isSaved && (
                <div className="mb-2 flex gap-1.5">
                    {(image || imageUrl) && (
                        <button 
                            onClick={onNewImage} 
                            disabled={loadingNewImage}
                            className="flex-1 rounded-md bg-amber-500 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {loadingNewImage ?
    <div className="flex items-center justify-center gap-1.5">
        <Loader type="spinner" size="small" inline color="#ffffff" />
        <span className="text-xs font-medium">
            {currentImageLoadingMessage?.currentStepTitle || currentImageLoadingMessage?.title || 'Generating'}
        </span>
    </div> : 'New Image'}
                        </button>
                    )}
                    {examples.length > 0 && (
                        <button 
                            onClick={onNewExamples} 
                            disabled={loadingNewExamples}
                            className="flex-1 rounded-md bg-amber-500 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {loadingNewExamples ?
    <div className="flex items-center justify-center gap-1.5">
        <Loader type="spinner" size="small" inline color="#ffffff" />
        <span className="text-xs font-medium">
            {currentExamplesLoadingMessage?.currentStepTitle || currentExamplesLoadingMessage?.title || 'Loading'}
        </span>
    </div> : 'New Examples'}
                        </button>
                    )}
                </div>
            )}
            
            {/* Кнопки действий - скрываем в режиме предварительного просмотра */}
            {!hideActionButtons && (
                <>
                    {/* Кнопка сохранения/статус карточки */}
                    <div className="mb-2.5">
                        {!isEditMode && !isSaved && (
                            // Показываем кнопку "Save Card" для новых карточек
                            <div className="flex w-full gap-2">
                                {!loadingGetResult && (
                                    <button 
                                        onClick={onAccept} 
                                        disabled={loadingAccept}
                                        className="flex flex-1 items-center justify-center gap-2 rounded-md bg-green-500 px-2.5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                        <FaCheck />
                                        {loadingAccept ? 
                <div className="flex items-center justify-center">
                    <Loader type="spinner" size="small" inline color="#ffffff" text="Saving" />
                </div> : 'Save Card'}
                                    </button>
                                )}
                            </div>
                        )}
                        
                        {/* Пояснительный текст под кнопкой */}
                        {!isEditMode && !isSaved && !loadingGetResult && (
                            <p className="m-0 mt-1 text-center text-[11px] text-gray-500">
                                The card will be saved to your collection
                            </p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default ResultDisplay;
