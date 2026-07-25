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
    /** Forces inline editing on (or off) instead of the internal "Edit Card" toggle.
     *  The edit modal is already an editing context, so it passes `true` and the
     *  fields are directly editable — no second button to press. */
    editable?: boolean;
    /** The status pill and timestamp. Pointless right after creation, where the card
     *  is obviously new and seconds old; useful when reviewing a stored card. */
    showStatus?: boolean;
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
            editable,
            showStatus = true,
            createdAt
        }
    ) => {

    const [isEditingTranslation, setIsEditingTranslation] = useState(false);
    const [localTranslation, setLocalTranslation] = useState(translation || '');
    const [isEditingBack, setIsEditingBack] = useState(false);
    const [localBack, setLocalBack] = useState(back || '');
    const [internalEditMode, setInternalEditMode] = useState(false);
    // When `editable` is supplied (the edit modal), it drives edit mode directly so
    // there is no separate "Edit Card" button to press first.
    const isEditMode = editable !== undefined ? editable : internalEditMode;
    const setIsEditMode = setInternalEditMode;
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
        
        // 4. Grammar facts persist inline through GrammarCard's onChange, so nothing to
        //    flush here on exit.

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

    // The mobile study card bolds the studied word inside each example so the eye lands on
    // it. Same treatment here keeps the two views recognisably one card.
    const highlightStudiedWord = (text: string): React.ReactNode => {
        const word = (front || '').trim();
        if (!word) return text;
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
        return parts.map((part, i) =>
            part.toLowerCase() === word.toLowerCase()
                ? <strong key={i} className="font-bold text-gray-900">{part}</strong>
                : <React.Fragment key={i}>{part}</React.Fragment>
        );
    };

    // Рендер кнопки редактирования/сохранения
    const renderEditSaveButton = () => {
        // In a controlled (modal) context the fields are already editable, so neither
        // the "Edit Card" nor the "Finish Editing" button belongs here.
        if (editable !== undefined) return null;
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
        // The modal's own composer explains how to change the card; the blue banner is noise there.
        if (editable !== undefined) return null;

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

    return (
        <div className={`w-full max-w-full overflow-x-hidden ${isEditMode && editable === undefined ? 'rounded-card border border-accent-border bg-accent-subtle/40 p-3' : ''}`}>
            {showStatus && (
            <div className={`mb-3 flex flex-col items-end gap-1 rounded-control border px-2 py-1.5 text-right text-[10px] ${isEditMode ? 'border-accent-border bg-accent-subtle text-accent' : isSaved ? 'border-ok-border bg-ok-subtle text-ok-strong' : 'border-line bg-surface-muted text-gray-500'}`}>
                <div className="flex items-center gap-1">
                    <span className={`inline-block h-2 w-2 rounded-full ${isEditMode ? 'bg-accent' : isSaved ? 'bg-ok' : 'bg-gray-400'}`}></span>
                    <strong className={`${isEditMode ? 'text-accent' : isSaved ? 'text-ok-strong' : 'text-gray-600'}`}>{isEditMode
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
            )}

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
                                <div className="text-center">
                                    <h3 className="m-0 text-[30px] font-bold leading-tight tracking-tight text-gray-900">{wordPart}</h3>
                                    {pronunciation && (
                                        <div className="mt-1 font-mono text-sm text-gray-500">{pronunciation}</div>
                                    )}
                                </div>
                            )
                        })()
                    ) : (
                        <h3 className="m-0 text-center text-[30px] font-bold leading-tight tracking-tight text-gray-900">{front}</h3>
                    )}
                </div>
            )}
            
            {/* Транскрипция - отображается между словом и переводом */}
            {transcription && (
                <div className="-mt-1 mb-3 text-center">
                    <div
                        className="font-mono text-sm leading-relaxed text-gray-500"
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
                            aria-label="Play pronunciation"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-subtle text-accent transition-colors hover:bg-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <FaVolumeUp size={16} />
                        </button>
                    )}
                    {onGenerateAudio && hasMissingAnyAudio && (
                        <button
                            onClick={onGenerateAudio}
                            disabled={loadingAudio}
                            className="rounded-control px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-surface-sunken hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            {loadingAudio ? 'Generating…' : 'Add audio'}
                        </button>
                    )}
                </div>
            )}
            
            {/* Display translation for Language Learning mode or back for General mode */}
            {(mode === Modes.LanguageLearning ? translation : back) && (
                <>
                    
                    {/* Editing mode for translation (Language Learning) or back (General) */}
                    {(mode === Modes.LanguageLearning ? isEditingTranslation : isEditingBack) && isEditMode ? (
                        <div className="relative mb-3">
                            {mode === Modes.LanguageLearning ? (
                                <input
                                    type="text"
                                    value={localTranslation}
                                    onChange={(e) => setLocalTranslation(e.target.value)}
                                    className="w-full rounded-control border border-accent bg-white px-3 py-2 text-center text-sm font-semibold text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                                    className="min-h-[120px] w-full resize-y rounded-control border border-accent bg-white p-3 text-sm font-normal leading-6 text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                        className={`relative mb-3 ${mode === Modes.LanguageLearning ? 'text-center' : 'text-left'} ${isEditMode ? 'cursor-text rounded-control border border-dashed border-line bg-surface-muted p-2 pr-8 transition-colors hover:border-accent hover:bg-surface-sunken' : ''}`}
                        onClick={isEditMode ? (mode === Modes.LanguageLearning ? handleTranslationEdit : handleBackEdit) : undefined}
                        >
                            {mode === Modes.LanguageLearning ? (
                                <p className={`m-0 font-semibold text-gray-900 ${isEditMode ? 'text-base' : 'text-[22px] leading-snug'}`}>{translation}</p>
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
                                    className="absolute right-2 top-1/2 flex -translate-y-1/2 cursor-pointer rounded-control bg-white p-1 text-gray-400 shadow-control transition-colors hover:bg-surface-sunken hover:text-accent"
                                    title={mode === Modes.LanguageLearning ? "Edit translation" : "Edit content"}
                                >
                                    <FaPen size={12} />
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
            
            {/* Grammar Reference — the mint panel mirrors the mobile study card, so a card
                looks the same in the extension and in the app. */}
            {linguisticInfo && (
                <div className="mb-4 mt-3 rounded-card border border-ok-border bg-ok-subtle p-3">
                    <button
                        type="button"
                        aria-expanded={expandedLinguistics}
                        onClick={() => setExpandedLinguistics(!expandedLinguistics)}
                        className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        <span className="text-[11px] font-bold uppercase tracking-wide text-ok-strong">
                            Grammar Reference
                        </span>
                        {expandedLinguistics
                            ? <FaChevronUp size={12} className="shrink-0 text-ok-strong" />
                            : <FaChevronDown size={12} className="shrink-0 text-ok-strong" />}
                    </button>

                    {expandedLinguistics && (
                        <div className="pt-2.5">
                            <GrammarCard
                                content={linguisticInfo || ''}
                                isEditable={isEditMode}
                                onChange={(serialized) => setLinguisticInfo?.(serialized)}
                            />
                        </div>
                    )}
                </div>
            )}
            
            {examples.length > 0 && (
                <>
                    <div className="mb-3">
                        <h4 className="m-0 mb-2.5 border-t border-line pt-3 text-[13px] font-semibold text-gray-500">Examples</h4>

                        <ul className="m-0 flex list-none flex-col gap-3 p-0">
                            {examples.map(([example, translatedExample], index) => (
                                <li key={index} className={`relative min-h-0 break-words overflow-visible ${isEditMode ? 'rounded-control border border-dashed border-line bg-white p-3' : ''}`}>
                                    {isEditMode && (
                                        <div className="absolute right-2 top-2 z-[5] flex gap-2">
                                            <button
                                                onClick={() => handleDeleteExample(index)}
                                                className="flex cursor-pointer items-center justify-center rounded-control bg-danger-subtle px-1.5 py-1 text-[11px] font-medium text-danger-strong hover:bg-danger-border"
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
                                                    className="min-h-10 w-full resize-y rounded-control border border-line bg-white px-2 py-1.5 text-[13px] font-medium leading-6 text-gray-900 outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                                                    placeholder="Example sentence"
                                                />
                                            </div>
                                            
                                            <div>
                                                <textarea
                                                    value={translatedExample || ''}
                                                    onChange={(e) => handleExampleEdit(index, false, e.target.value)}
                                                    className="min-h-10 w-full resize-y rounded-control border border-line bg-white px-2 py-1.5 text-[13px] italic leading-6 text-gray-500 outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                                                    placeholder="Translation (optional)"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-start gap-2.5">
                                            {examplesAudio[index] ? (
                                                <button
                                                    onClick={() => handlePlayExampleAudio(index)}
                                                    aria-label="Play example"
                                                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent transition-colors hover:bg-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                                >
                                                    <FaVolumeUp size={10} />
                                                </button>
                                            ) : (
                                                <span className="mt-0.5 shrink-0 text-[15px] leading-5 text-ok-strong" aria-hidden>•</span>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="break-words whitespace-normal text-[14px] leading-6 text-gray-900">
                                                    {highlightStudiedWord(example)}
                                                </div>
                                                {translatedExample && (
                                                    <div className="mt-0.5 break-words overflow-visible whitespace-normal text-[13px] leading-5 text-gray-500">
                                                        {translatedExample}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                        
                        {isEditMode && (
                            <button
                                onClick={handleAddExample}
                                className="mt-3 flex w-full items-center justify-center gap-2 rounded-control border border-dashed border-accent-border bg-accent-subtle px-2.5 py-2.5 text-sm font-medium text-accent transition-colors hover:border-accent hover:bg-accent-subtle/70"
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
                    <div className="mb-4">
                        <img
                            src={image || imageUrl || ''}
                            alt=""
                            className="max-h-64 w-full rounded-sheet border border-line bg-white object-contain"
                        />
                    </div>
                </>
            )}
            
            {!isSaved && !hideActionButtons && (
                <div className="mb-2 flex gap-1.5">
                    {(image || imageUrl) && (
                        <button 
                            onClick={onNewImage} 
                            disabled={loadingNewImage}
                            className="flex-1 rounded-control border border-line bg-white px-3 py-2 text-[13px] font-semibold text-gray-700 shadow-control transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-70"
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
                            className="flex-1 rounded-control border border-line bg-white px-3 py-2 text-[13px] font-semibold text-gray-700 shadow-control transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-70"
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
                                        className="flex flex-1 items-center justify-center gap-2 rounded-control bg-accent px-2.5 py-2.5 text-sm font-semibold text-white shadow-control transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
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
