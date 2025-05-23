import React, { useState } from 'react';
import { FaCheck, FaList, FaPen, FaTrash, FaPlus, FaTimes, FaEdit, FaSave, FaSync, FaChevronDown, FaChevronUp, FaBook, FaInfoCircle } from 'react-icons/fa';
import { FaLanguage, FaGraduationCap, FaBookOpen, FaQuoteRight, FaTags } from 'react-icons/fa';
import { Modes } from "../constants";
import Loader from './Loader';
import '../styles/grammarStyles.css';
import GrammarCard from './grammar/GrammarCard';

interface ResultDisplayProps {
    front: string | null
    translation: string | null;
    examples: Array<[string, string | null]>;
    imageUrl: string | null;
    image: string | null;
    linguisticInfo?: string;
    onNewImage: () => void;
    onNewExamples: () => void;
    onAccept: () => void;
    onViewSavedCards: () => void;
    onCancel?: () => void;
    loadingNewImage: boolean;
    loadingNewExamples: boolean;
    loadingAccept: boolean;
    mode?: Modes; 
    shouldGenerateImage?: boolean;
    isSaved?: boolean;
    isEdited?: boolean;
    setTranslation?: (translation: string) => void;
    setExamples?: (examples: Array<[string, string | null]>) => void;
    setLinguisticInfo?: (info: string) => void;
}

const ResultDisplay: React.FC<ResultDisplayProps> = (
        { 
            front, 
            translation, 
            examples, 
            imageUrl,
            image,
            linguisticInfo,
            onNewImage, 
            onNewExamples, 
            onAccept,
            onViewSavedCards,
            onCancel,
            mode = Modes.LanguageLearning, 
            loadingNewImage, 
            loadingNewExamples, 
            loadingAccept,
            shouldGenerateImage = true,
            isSaved = false,
            isEdited = false,
            setTranslation,
            setExamples,
            setLinguisticInfo
        }
    ) => {
    
    const [isEditingTranslation, setIsEditingTranslation] = useState(false);
    const [localTranslation, setLocalTranslation] = useState(translation || '');
    const [isEditMode, setIsEditMode] = useState(false);
    const [expandedExamples, setExpandedExamples] = useState(true);
    const [expandedLinguistics, setExpandedLinguistics] = useState(true);

    // Включить режим редактирования
    const enableEditMode = () => {
        setIsEditMode(true);
    };

    // Выключить режим редактирования и сохранить изменения
    const disableEditMode = () => {
        // Сначала сохраняем все изменения
        onAccept();
        
        // Затем выходим из режима редактирования
        setIsEditMode(false);
        
        // Если есть несохраненные изменения в переводе, сохраняем их
        if (isEditingTranslation && setTranslation) {
            setTranslation(localTranslation);
            setIsEditingTranslation(false);
        }
    };

    // Handle translation edit
    const handleTranslationEdit = () => {
        if (!isEditMode) return;
        setIsEditingTranslation(true);
        setLocalTranslation(translation || '');
    };

    const handleTranslationSave = () => {
        if (setTranslation) {
            setTranslation(localTranslation);
        }
        setIsEditingTranslation(false);
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
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        backgroundColor: '#3B82F6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        marginBottom: '12px',
                        width: '100%',
                        opacity: loadingAccept ? 0.7 : 1
                    }}
                    onMouseOver={(e) => !loadingAccept && (e.currentTarget.style.backgroundColor = '#2563EB')}
                    onMouseOut={(e) => !loadingAccept && (e.currentTarget.style.backgroundColor = '#3B82F6')}
                >
                    <FaSave size={14} />
                    {loadingAccept ? 
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader type="spinner" size="small" inline color="#ffffff" text="Saving" />
    </div> : 'Save & Finish Editing'}
                </button>
            );
        }

        // Кнопка редактирования появляется только когда карточка сохранена и не в режиме редактирования
        if (isSaved && !isEditMode) {
            return (
                <button
                    onClick={enableEditMode}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        backgroundColor: '#F3F4F6',
                        color: '#4B5563',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        padding: '10px 12px',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        marginBottom: '12px',
                        width: '100%'
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#E5E7EB';
                        e.currentTarget.style.color = '#1F2937';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = '#F3F4F6';
                        e.currentTarget.style.color = '#4B5563';
                    }}
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
            <div style={{
                marginBottom: '16px',
                backgroundColor: '#EFF6FF',
                borderRadius: '6px',
                padding: '10px',
                border: '1px solid #DBEAFE',
                fontSize: '13px',
                color: '#1E40AF'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '6px',
                    fontWeight: '600'
                }}>
                    <FaEdit size={12} />
                    Editing Mode
                </div>
                <p style={{ margin: 0, fontSize: '12px' }}>
                    Click on text elements to edit them. When finished, click "Save & Finish Editing" at the top of the card.
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
        <div style={{
            padding: '16px',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '100%',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
            overflowX: 'hidden',
            backgroundColor: isEditMode ? '#FAFAFA' : '#ffffff',
            borderLeft: isEditMode 
                ? '3px solid #3B82F6' 
                : '3px solid transparent'
        }}>
            {/* Status indicator - improved and more intuitive */}
            <div style={{ 
                fontSize: '10px', 
                color: '#9CA3AF', 
                marginBottom: '12px', 
                textAlign: 'right',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: isEditMode ? '#EFF6FF' : (isSaved ? '#ECFDF5' : '#F9FAFB'),
                borderRadius: '4px',
                border: isEditMode ? '1px solid #DBEAFE' : (isSaved ? '1px solid #D1FAE5' : '1px solid #F3F4F6')
            }}>
                <span style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isEditMode ? '#3B82F6' : (isSaved 
                        ? '#10B981'
                        : '#6B7280')
                }}></span>
                <strong style={{
                    color: isEditMode ? '#1E40AF' : (isSaved 
                        ? '#059669'
                        : '#4B5563')
                }}>{isEditMode 
                    ? 'Editing' 
                    : (isSaved 
                        ? 'Saved to Collection'
                        : 'New - Not Saved Yet')}
                </strong>
            </div>

            {/* Кнопка редактирования/сохранения - показывается вверху карточки */}
            {renderEditSaveButton()}
            
            {/* Подсказка для редактирования */}
            {renderEditingHint()}

            {front && (
                <div style={{ marginBottom: '12px' }}>
                    {/* Format the front content nicely */}
                    {front.includes("/") ? (
                        // If it has pronunciation (contains a slash), format it appropriately
                        (() => {
                            // Extract word and pronunciation
                            const parts = front.split(/\s*\//)
                            const wordPart = parts[0]?.trim() || ''
                            const pronunciation = parts.length > 1 ? 
                                `/${parts.slice(1).join('/').replace(/\/$/, '')}` : ''
                            
                            return (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '12px',
                                    backgroundColor: '#F3F4F6',
                                    borderRadius: '8px'
                                }}>
                                    <h3 style={{
                                        fontSize: '20px',
                                        fontWeight: '700',
                                        margin: '0 0 6px 0',
                                        color: '#111827'
                                    }}>{wordPart}</h3>
                                    {pronunciation && (
                                        <div style={{
                                            fontSize: '14px',
                                            color: '#6B7280',
                                            fontStyle: 'italic'
                                        }}>{pronunciation}</div>
                                    )}
                                </div>
                            )
                        })()
                    ) : (
                        // Simple formatting for plain text
                        <h3 style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            textAlign: 'center',
                            margin: '2px 0',
                            color: '#111827',
                            padding: '10px',
                            backgroundColor: '#F3F4F6',
                            borderRadius: '8px'
                        }}>{front}</h3>
                    )}
                </div>
            )}
            
            {translation && (
                <>
                    <hr style={{
                        margin: '10px 0',
                        border: 'none',
                        borderTop: '1px solid #E5E7EB'
                    }} />
                    
                    {isEditingTranslation && isEditMode ? (
                        <div style={{
                            marginBottom: '12px',
                            position: 'relative'
                        }}>
                            <input
                                type="text"
                                value={localTranslation}
                                onChange={(e) => setLocalTranslation(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #3B82F6',
                                    backgroundColor: '#ffffff',
                                    color: '#111827',
                                    fontSize: '14px',
                                    outline: 'none',
                                    fontWeight: '600',
                                    textAlign: 'center',
                                }}
                                autoFocus
                                onBlur={handleTranslationSave}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleTranslationSave();
                                    }
                                }}
                            />
                            <div style={{
                                fontSize: '11px',
                                color: '#6B7280',
                                textAlign: 'center',
                                marginTop: '4px'
                            }}>
                                Press Enter or click outside to save
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            marginBottom: '12px',
                            textAlign: 'center',
                            position: 'relative',
                            paddingRight: isEditMode ? '24px' : '0',
                            ...(isEditMode ? {
                                padding: '8px',
                                border: '1px dashed #E5E7EB',
                                borderRadius: '4px',
                                transition: 'all 0.2s ease',
                                cursor: 'pointer',
                                backgroundColor: '#FAFAFA'
                            } : {})
                        }}
                        onClick={isEditMode ? handleTranslationEdit : undefined}
                        onMouseOver={(e) => {
                            if (isEditMode) {
                                e.currentTarget.style.borderColor = '#3B82F6';
                                e.currentTarget.style.backgroundColor = '#F9FAFB';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (isEditMode) {
                                e.currentTarget.style.borderColor = '#E5E7EB';
                                e.currentTarget.style.backgroundColor = '#FAFAFA';
                            }
                        }}
                        >
                            <p style={{
                                fontWeight: '600',
                                color: '#111827',
                                fontSize: '14px',
                                margin: 0
                            }}>{translation}</p>
                            
                            {isEditMode && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); // Предотвращаем всплытие события
                                        handleTranslationEdit();
                                    }}
                                    style={{
                                        position: 'absolute',
                                        right: '8px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: '#F3F4F6',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        color: '#6B7280',
                                        display: 'flex',
                                        padding: '4px',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                    }}
                                    title="Edit translation"
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = '#E5E7EB';
                                        e.currentTarget.style.color = '#3B82F6';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = '#F3F4F6';
                                        e.currentTarget.style.color = '#6B7280';
                                    }}
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
                <div style={{
                    marginTop: '12px',
                    marginBottom: '16px',
                    borderRadius: '10px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                    border: '1px solid',
                    borderColor: expandedLinguistics ? '#BFDBFE' : '#E5E7EB',
                    backgroundColor: expandedLinguistics ? '#EFF6FF' : '#F9FAFB',
                    transition: 'all 0.3s ease',
                    overflow: 'hidden'
                }}>
                    {/* Заголовок секции с разделенной логикой клика */}
                    <div 
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            borderBottom: expandedLinguistics ? '1px solid #BFDBFE' : 'none',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontWeight: 600,
                            fontSize: '14px',
                            color: expandedLinguistics ? '#1D4ED8' : '#4B5563',
                            flex: 1
                        }}>
                            <FaGraduationCap size={16} color={expandedLinguistics ? '#2563EB' : '#6B7280'} />
                            <span>Grammar & Linguistics</span>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                console.log('Grammar section toggle button clicked');
                                setExpandedLinguistics(!expandedLinguistics);
                            }}
                            style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '4px',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            {expandedLinguistics ? 
                                <FaChevronUp size={14} color="#6B7280" /> : 
                                <FaChevronDown size={14} color="#6B7280" />
                            }
                        </button>
                    </div>
                    
                    {/* Содержимое раздела без onClick */}
                    {expandedLinguistics && (
                        <div 
                            style={{ padding: '16px' }}
                        >
                            {linguisticInfoEditable ? (
                                <div style={{ width: '100%' }}>
                                    <textarea
                                        value={linguisticInfoValue}
                                        onChange={handleLinguisticInfoChange}
                                        style={{
                                            width: '100%',
                                            minHeight: '120px',
                                            padding: '10px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid #E5E7EB',
                                            fontSize: '14px',
                                            lineHeight: '1.5',
                                            resize: 'vertical',
                                            marginBottom: '8px'
                                        }}
                                    />
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'flex-end',
                                        gap: '8px'
                                    }}>
                                        <button
                                            onClick={handleLinguisticInfoCancel}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: '#F3F4F6',
                                                color: '#4B5563',
                                                border: '1px solid #E5E7EB',
                                                borderRadius: '6px',
                                                fontSize: '13px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleLinguisticInfoSave}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: '#2563EB',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontSize: '13px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Save
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ position: 'relative' }}>
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
                    <hr style={{
                        margin: '10px 0',
                        border: 'none',
                        borderTop: '1px solid #E5E7EB'
                    }} />
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '8px'
                        }}>
                            <h4 style={{
                                fontSize: '14px',
                                fontWeight: '600',
                                color: '#374151',
                                margin: 0
                            }}>Examples</h4>
                        </div>
                        
                        <ul style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0
                        }}>
                            {examples.map(([example, translatedExample], index) => (
                                <li key={index} style={{
                                    marginBottom: '8px',
                                    padding: '10px',
                                    backgroundColor: isEditMode ? '#F9FAFB' : '#F9FAFB',
                                    borderRadius: '6px',
                                    position: 'relative',
                                    ...(isEditMode ? {
                                        border: '1px dashed #CBD5E1',
                                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                    } : {})
                                }}>
                                    {isEditMode && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
                                            display: 'flex',
                                            gap: '8px',
                                            zIndex: 5
                                        }}>
                                            <button
                                                onClick={() => handleDeleteExample(index)}
                                                style={{
                                                    background: '#FEE2E2',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    color: '#EF4444',
                                                    padding: '4px 6px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '11px',
                                                    fontWeight: '500'
                                                }}
                                                title="Delete example"
                                                onMouseOver={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#FECACA';
                                                }}
                                                onMouseOut={(e) => {
                                                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                                                }}
                                            >
                                                <FaTrash size={10} style={{ marginRight: '4px' }} />
                                                Delete
                                            </button>
                                        </div>
                                    )}
                                    
                                    {isEditMode ? (
                                        <>
                                            <div style={{ marginBottom: '8px' }}>
                                                <input
                                                    type="text"
                                                    value={example}
                                                    onChange={(e) => handleExampleEdit(index, true, e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #E5E7EB',
                                                        fontSize: '13px',
                                                        color: '#111827',
                                                        fontWeight: '500',
                                                        backgroundColor: '#ffffff'
                                                    }}
                                                    placeholder="Example sentence"
                                                />
                                            </div>
                                            
                                            <div>
                                                <input
                                                    type="text"
                                                    value={translatedExample || ''}
                                                    onChange={(e) => handleExampleEdit(index, false, e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px 8px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #E5E7EB',
                                                        fontSize: '13px',
                                                        color: '#6B7280',
                                                        fontStyle: 'italic',
                                                        backgroundColor: '#ffffff'
                                                    }}
                                                    placeholder="Translation (optional)"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ 
                                                fontWeight: '500',
                                                color: '#111827',
                                                fontSize: '13px',
                                                marginBottom: translatedExample ? '6px' : 0
                                            }}>
                                                {example}
                                            </div>
                                            {translatedExample && (
                                                <div style={{ 
                                                    color: '#6B7280',
                                                    fontSize: '13px',
                                                    fontStyle: 'italic'
                                                }}>
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
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#EFF6FF',
                                    color: '#3B82F6',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    border: '1px dashed #BFDBFE',
                                    cursor: 'pointer',
                                    marginTop: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#DBEAFE';
                                    e.currentTarget.style.borderColor = '#93C5FD';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = '#EFF6FF';
                                    e.currentTarget.style.borderColor = '#BFDBFE';
                                }}
                            >
                                <FaPlus size={12} />
                                Add Example
                            </button>
                        )}
                    </div>
                </>
            )}
            
            {imageUrl && (
                <>
                    <hr style={{
                        margin: '16px 0',
                        border: 'none',
                        borderTop: '1px solid #E5E7EB'
                    }} />
                    <div style={{ marginBottom: '16px' }}>
                        <img 
                            src={imageUrl} 
                            alt="" 
                            style={{
                                width: '100%',
                                borderRadius: '6px',
                                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                            }} 
                        />
                    </div>
                </>
            )}
            
            {!isSaved && (
                <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginBottom: '8px'
                }}>
                    {imageUrl && (
                        <button 
                            onClick={onNewImage} 
                            disabled={loadingNewImage}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '6px',
                                backgroundColor: '#F59E0B',
                                color: '#ffffff',
                                fontWeight: '600',
                                fontSize: '13px',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: loadingNewImage ? 0.7 : 1
                            }}
                            onMouseOver={(e) => !loadingNewImage && (e.currentTarget.style.backgroundColor = '#D97706')}
                            onMouseOut={(e) => !loadingNewImage && (e.currentTarget.style.backgroundColor = '#F59E0B')}
                        >
                            {loadingNewImage ? 
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader type="pulse" size="small" inline color="#ffffff" text="Generating" />
    </div> : 'New Image'}
                        </button>
                    )}
                    {examples.length > 0 && (
                        <button 
                            onClick={onNewExamples} 
                            disabled={loadingNewExamples}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '6px',
                                backgroundColor: '#F59E0B',
                                color: '#ffffff',
                                fontWeight: '600',
                                fontSize: '13px',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: loadingNewExamples ? 0.7 : 1
                            }}
                            onMouseOver={(e) => !loadingNewExamples && (e.currentTarget.style.backgroundColor = '#D97706')}
                            onMouseOut={(e) => !loadingNewExamples && (e.currentTarget.style.backgroundColor = '#F59E0B')}
                        >
                            {loadingNewExamples ? 
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader type="dots" size="small" inline color="#ffffff" text="Loading" />
    </div> : 'New Examples'}
                        </button>
                    )}
                </div>
            )}
            
            {/* Кнопка сохранения/статус карточки */}
            <div style={{ marginBottom: '10px' }}>
                {!isEditMode && !isSaved && (
                    // Только для новых карточек показываем кнопку "Save Card"
                    <div style={{ 
                        display: 'flex', 
                        gap: '8px', 
                        width: '100%' 
                    }}>
                        <button 
                            onClick={onCancel} 
                            style={{
                                flex: '1',
                                padding: '10px',
                                borderRadius: '6px',
                                backgroundColor: '#F3F4F6',
                                color: '#4B5563',
                                fontWeight: '600',
                                fontSize: '14px',
                                border: '1px solid #E5E7EB',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#E5E7EB';
                                e.currentTarget.style.color = '#374151';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#F3F4F6';
                                e.currentTarget.style.color = '#4B5563';
                            }}
                        >
                            <FaTimes />
                            Cancel
                        </button>
                        <button 
                            onClick={onAccept} 
                            disabled={loadingAccept}
                            style={{
                                flex: '2',
                                padding: '10px',
                                borderRadius: '6px',
                                backgroundColor: '#22C55E',
                                color: '#ffffff',
                                fontWeight: '600',
                                fontSize: '14px',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: loadingAccept ? 0.7 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                            onMouseOver={(e) => !loadingAccept && (e.currentTarget.style.backgroundColor = '#15803D')}
                            onMouseOut={(e) => !loadingAccept && (e.currentTarget.style.backgroundColor = '#22C55E')}
                        >
                            <FaCheck />
                            {loadingAccept ? 
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader type="spinner" size="small" inline color="#ffffff" text="Saving" />
    </div> : 'Save Card'}
                        </button>
                    </div>
                )}
                
                {!isEditMode && isSaved && (
                    // Для сохраненных карточек показываем индикатор статуса
                    <div style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '6px',
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #D1FAE5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: '#10B981',
                            color: 'white'
                        }}>
                            <FaCheck size={12} />
                        </div>
                        <span style={{
                            fontWeight: '600',
                            fontSize: '14px',
                            color: '#059669'
                        }}>
                            Saved to Collection
                        </span>
                    </div>
                )}

                {/* Пояснительный текст под кнопкой */}
                {!isEditMode && !isSaved && (
                    <p style={{
                        fontSize: '11px',
                        color: '#6B7280',
                        textAlign: 'center',
                        margin: '4px 0 0 0'
                    }}>
                        The card will be saved to your collection
                    </p>
                )}
            </div>
            
            <button 
                onClick={onViewSavedCards}
                style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    backgroundColor: '#4B5563',
                    color: '#ffffff',
                    fontWeight: '600',
                    fontSize: '13px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#4B5563'}
            >
                <FaList size={14} />
                View Saved Cards
            </button>
        </div>
    );
};

export default ResultDisplay;
