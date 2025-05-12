import React from 'react';
import { FaCheck, FaList } from 'react-icons/fa';
import { Modes } from "../constants";

interface ResultDisplayProps {
    front: string | null
    back: string | null
    translation: string | null;
    examples: Array<[string, string | null]>;
    imageUrl: string | null;
    image: string | null;
    onNewImage: () => void;
    onNewExamples: () => void;
    onAccept: () => void;
    onViewSavedCards: () => void;
    loadingNewImage: boolean;
    loadingNewExamples: boolean;
    loadingAccept: boolean;
    mode?: Modes; 
    shouldGenerateImage?: boolean;
}

const ResultDisplay: React.FC<ResultDisplayProps> = (
        { 
            front, 
            back, 
            translation, 
            examples, 
            imageUrl,
            image,
            onNewImage, 
            onNewExamples, 
            onAccept,
            onViewSavedCards,
            mode = Modes.LanguageLearning, 
            loadingNewImage, 
            loadingNewExamples, 
            loadingAccept,
            shouldGenerateImage = true
        }
    ) => {
    return (
        <div style={{
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '100%',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            overflowX: 'hidden'
        }}>
            {front && (
                <div style={{ marginBottom: '12px' }}>
                    <h3 style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        textAlign: 'center',
                        margin: '2px 0',
                        color: '#111827'
                    }}>{front}</h3>
                </div>
            )}
            {back && (
                <div style={{ marginBottom: '16px' }}>
                    {back.replace("Key Points", "").split("-").filter(point => point.trim() !== '').map((point, index) => (
                        <div key={index} style={{
                            marginBottom: '12px',
                            padding: '10px',
                            backgroundColor: '#F9FAFB',
                            borderRadius: '6px',
                            color: '#374151',
                            fontSize: '13px',
                            lineHeight: '1.4'
                        }}>{point}</div>
                    ))}
                </div>
            )}
            {translation && (
                <>
                    <hr style={{
                        margin: '10px 0',
                        border: 'none',
                        borderTop: '1px solid #E5E7EB'
                    }} />
                    <div style={{
                        marginBottom: '12px',
                        textAlign: 'center'
                    }}>
                        <p style={{
                            fontWeight: '600',
                            color: '#111827',
                            fontSize: '14px'
                        }}>{translation}</p>
                    </div>
                </>
            )}
            {examples.length > 0 && (
                <>
                    <hr style={{
                        margin: '10px 0',
                        border: 'none',
                        borderTop: '1px solid #E5E7EB'
                    }} />
                    <div style={{ marginBottom: '12px' }}>
                        <ul style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: 0
                        }}>
                            {examples.map(([example, translatedExample]) => (
                                <li key={example} style={{
                                    marginBottom: '8px',
                                    padding: '8px',
                                    backgroundColor: '#F9FAFB',
                                    borderRadius: '6px'
                                }}>
                                    <span style={{
                                        fontWeight: '500',
                                        color: '#111827',
                                        fontSize: '13px',
                                        display: 'block',
                                        marginBottom: translatedExample ? '6px' : 0,
                                        wordBreak: 'break-word'
                                    }}>{example.replace(/^(\d+\. )?"(.*)"$/, '$1$2').trim()}</span>
                                    {translatedExample && (
                                        <span style={{
                                            color: '#6B7280',
                                            fontSize: '13px',
                                            fontStyle: 'italic',
                                            display: 'block',
                                            wordBreak: 'break-word'
                                        }}>{translatedExample.replace(/^(\d+\. )?"(.*)"$/, '$2').trim()}</span>
                                    )}
                                </li>
                            ))}
                        </ul>
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
                        {loadingNewImage ? 'Loading...' : 'New Image'}
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
                        {loadingNewExamples ? 'Loading...' : 'New Examples'}
                    </button>
                )}
            </div>
            
            <div style={{ marginBottom: '10px' }}>
                <button 
                    onClick={onAccept} 
                    disabled={loadingAccept}
                    style={{
                        width: '100%',
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
                    {loadingAccept ? 'Saving...' : 'Save Card'}
                </button>
                <p style={{
                    fontSize: '11px',
                    color: '#6B7280',
                    textAlign: 'center',
                    margin: '4px 0 0 0'
                }}>The card will be saved to your collection</p>
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
