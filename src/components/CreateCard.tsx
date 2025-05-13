import React, {useEffect, useState} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import {RootState} from "../store";
import {setDeckId} from "../store/actions/decks";
import {saveCardToStorage, setBack, setExamples, setImage, setImageUrl, setTranslation, setText, loadStoredCards, setFront} from "../store/actions/cards";
import { CardLangLearning, CardGeneral } from '../services/ankiService';
import {generateAnkiBack, generateAnkiFront, getDescriptionImage, getExamples, translateText} from "../services/openaiApi";
import { setMode, setShouldGenerateImage, setTranslateToLanguage, setAIInstructions, setImageInstructions } from "../store/actions/settings";
import {Modes} from "../constants";
import ResultDisplay from "./ResultDisplay";
import { OpenAI } from 'openai';
import { getImage } from '../apiUtils';
import useErrorNotification from './useErrorHandler';
import { setCurrentPage } from "../store/actions/page";
import { FaCog, FaLightbulb, FaCode, FaImage, FaMagic } from 'react-icons/fa';


interface CreateCardProps {
    // Пустой интерфейс, так как больше не нужен onSettingsClick
}

const CreateCard: React.FC<CreateCardProps> = () => {
    const [showResult, setShowResult] = useState(false);
    const deckId = useSelector((state: RootState) => state.deck.deckId);

    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();
    const { text, translation, examples, image, imageUrl, front, back } = useSelector((state: RootState) => state.cards);
    const translateToLanguage = useSelector((state: RootState) => state.settings.translateToLanguage);
    const aiInstructions = useSelector((state: RootState) => state.settings.aiInstructions);
    const imageInstructions = useSelector((state: RootState) => state.settings.imageInstructions);
    const decks = useSelector((state: RootState) => state.deck.decks);
    const mode = useSelector((state: RootState) => state.settings.mode);
    const [originalSelectedText, setOriginalSelectedText] = useState('');
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const [loadingGetResult, setLoadingGetResult] = useState(false);
    const [loadingNewImage, setLoadingNewImage] = useState(false);
    const [loadingNewExamples, setLoadingNewExamples] = useState(false);
    const [loadingAccept, setLoadingAccept] = useState(false);
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const haggingFaceApiKey = useSelector((state: RootState) => state.settings.huggingFaceApiKey);
    const shouldGenerateImage = useSelector((state: RootState) => state.settings.shouldGenerateImage);
    const [showAISettings, setShowAISettings] = useState(false);
    const [showImageSettings, setShowImageSettings] = useState(false);
    const [localAIInstructions, setLocalAIInstructions] = useState(aiInstructions);
    const [localImageInstructions, setLocalImageInstructions] = useState(imageInstructions);
    const { showError, renderErrorNotification } = useErrorNotification()
    const openai = new OpenAI({
        apiKey: openAiKey,
        dangerouslyAllowBrowser: true,
    });
    const [customInstruction, setCustomInstruction] = useState('');
    const [isProcessingCustomInstruction, setIsProcessingCustomInstruction] = useState(false);

    const popularLanguages = [
        { code: 'ru', name: 'Русский' },
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Español' },
        { code: 'fr', name: 'Français' },
        { code: 'de', name: 'Deutsch' },
        { code: 'it', name: 'Italiano' },
        { code: 'pt', name: 'Português' },
        { code: 'ja', name: '日本語' },
        { code: 'ko', name: '한국어' },
        { code: 'zh', name: '中文' },
        { code: 'ar', name: 'العربية' },
    ];

    const handleNewImage = async () => {
        setLoadingNewImage(true);
        const descriptionImage = await getDescriptionImage(openAiKey, text, imageInstructions);
        const { imageUrl, imageBase64 } = await getImage(haggingFaceApiKey, openai, openAiKey, descriptionImage, imageInstructions);

        if (imageUrl) {
            dispatch(setImageUrl(imageUrl));
        }
        if (imageBase64) {
            dispatch(setImage(imageBase64));
        }
        setLoadingNewImage(false);
    }

    const handleNewExamples = async () => {
        setLoadingNewExamples(true)
        const newExamples = await getExamples(openAiKey, text, translateToLanguage, true);
        dispatch(setExamples(newExamples));
        setLoadingNewExamples(false)
    };

    const handleApplyCustomInstruction = async () => {
        if (!customInstruction.trim() || isProcessingCustomInstruction) {
            return;
        }
        
        setIsProcessingCustomInstruction(true);
        
        try {
            // Apply different actions based on content analysis
            if (customInstruction.toLowerCase().includes('image') || 
                customInstruction.toLowerCase().includes('picture') ||
                customInstruction.toLowerCase().includes('изображени') ||
                customInstruction.toLowerCase().includes('картин')) {
                
                // Generate new image based on instructions
                const descriptionImage = await getDescriptionImage(openAiKey, text, customInstruction);
                const { imageUrl, imageBase64 } = await getImage(haggingFaceApiKey, openai, openAiKey, descriptionImage, customInstruction);
                
                if (imageUrl) {
                    dispatch(setImageUrl(imageUrl));
                }
                if (imageBase64) {
                    dispatch(setImage(imageBase64));
                }
                
                showError('Image updated with your instructions!', 'success');
                
            } else if (customInstruction.toLowerCase().includes('example') || 
                      customInstruction.toLowerCase().includes('sentence') || 
                      customInstruction.toLowerCase().includes('пример') || 
                      customInstruction.toLowerCase().includes('предложени')) {
                
                // Generate new examples based on instructions
                const newExamples = await getExamples(openAiKey, text, translateToLanguage, true, customInstruction);
                dispatch(setExamples(newExamples));
                
                showError('Examples updated with your instructions!', 'success');
                
            } else if (customInstruction.toLowerCase().includes('translat') || 
                      customInstruction.toLowerCase().includes('перевод')) {
                
                // Update translation based on instructions
                const translatedText = await translateText(openAiKey, text, translateToLanguage, customInstruction);
                dispatch(setTranslation(translatedText));
                
                showError('Translation updated with your instructions!', 'success');
                
            } else {
                // Apply all updates if the intent is not clear
                const translatedText = await translateText(openAiKey, text, translateToLanguage, customInstruction);
                const newExamples = await getExamples(openAiKey, text, translateToLanguage, true, customInstruction);
                
                if (shouldGenerateImage) {
                    const descriptionImage = await getDescriptionImage(openAiKey, text, customInstruction);
                    const { imageUrl, imageBase64 } = await getImage(haggingFaceApiKey, openai, openAiKey, descriptionImage, customInstruction);
                    
                    if (imageUrl) {
                        dispatch(setImageUrl(imageUrl));
                    }
                    if (imageBase64) {
                        dispatch(setImage(imageBase64));
                    }
                }
                
                dispatch(setTranslation(translatedText));
                dispatch(setExamples(newExamples));
                
                showError('Content updated with your instructions!', 'success');
            }
            
            // Clear the instruction after applying
            setCustomInstruction('');
            
        } catch (error) {
            showError('Error applying your instructions. Please try again.');
            console.error('Error applying custom instructions:', error);
        } finally {
            setIsProcessingCustomInstruction(false);
        }
    };

    const handleCustomInstructionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleApplyCustomInstruction();
        }
    };

    const handleSettingsClick = () => {
        // Эта функция больше не нужна, но оставим ее пустой, чтобы не рефакторить весь код
    };

    const handleImageToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        dispatch(setShouldGenerateImage(isChecked));
    
        if (isChecked) {
            const descriptionImage = await getDescriptionImage(openAiKey, text, imageInstructions);
            const { imageUrl, imageBase64 } = await getImage(haggingFaceApiKey, openai, openAiKey, descriptionImage, imageInstructions)
            if (imageUrl) {
                dispatch(setImageUrl(imageUrl))
            }
            if (imageBase64) {
                dispatch(setImage(imageBase64))
            }
        } else {
            dispatch(setImageUrl(null))
        }
    }

    const handleAccept = async () => {
        showError(null);
        try {
            setLoadingAccept(true);
            
            if (mode === Modes.LanguageLearning) {
                if (!originalSelectedText || !translation) {
                    showError('Some required data is missing. Please make sure you have all the required data before saving.');
                    return;
                }
                
                // Save to localStorage only
                dispatch(saveCardToStorage({
                    mode,
                    text: originalSelectedText,
                    translation,
                    examples,
                    image,
                    imageUrl,
                    createdAt: new Date()
                }));
                
            } else if (mode === Modes.GeneralTopic && back) {
                // Save to localStorage only
                dispatch(saveCardToStorage({
                    mode,
                    front,
                    back,
                    text: originalSelectedText,
                    createdAt: new Date()
                }));
            }
            
            // Show success notification
            showError('Card saved to your collection!', 'success');
            
        } catch (error) {
            showError('Error saving card.');
        } finally {
            setTimeout(() => {
                setLoadingAccept(false);
            }, 1000);
        }
    };
    
    const handleViewSavedCards = () => {
        dispatch(setCurrentPage('storedCards'));
    };

    useEffect(() => {
        const handleMouseUp = () => {
            const selectedText = window.getSelection()?.toString().trim();
            if (selectedText) {
                dispatch(setText(selectedText));
            }
        };
    
        document.addEventListener('mouseup', handleMouseUp);
    
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dispatch]);    

    useEffect(() => {
        // Пока по дефолту ставим LanguageLearning
        dispatch(setMode(Modes.LanguageLearning))

        if (text && translation && examples.length > 0) {
            setShowResult(true);
        } else {
            setShowResult(false);
        }
        
        // Load stored cards from localStorage
        dispatch(loadStoredCards());
    }, [dispatch]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setShowResult(false);
        setLoadingGetResult(true);
    
        if (mode === Modes.LanguageLearning) {
            setOriginalSelectedText(text);
            dispatch(setFront(text));
            const translatedText = await translateText(openAiKey, text, translateToLanguage, aiInstructions)
            const examples = await getExamples(openAiKey, text, translateToLanguage, true, aiInstructions)
            if (shouldGenerateImage) {
                const descriptionImage = await getDescriptionImage(openAiKey, text, imageInstructions);
                const { imageUrl, imageBase64 } = await getImage(haggingFaceApiKey, openai, openAiKey, descriptionImage, imageInstructions)

                if (imageUrl) {
                    dispatch(setImageUrl(imageUrl))
                }
                if (imageBase64) {
                    dispatch(setImage(imageBase64))
                }
            }
            
            dispatch(setText(text));
            dispatch(setTranslation(translatedText));
            dispatch(setExamples(examples));
    
            setLoadingGetResult(false);
            if (translatedText) {
                setShowResult(true);
            }
        } else if (mode === Modes.GeneralTopic) {
            setOriginalSelectedText(text);
            setText(text);
            const front = await generateAnkiFront(openAiKey, text)
            const back = await generateAnkiBack(openAiKey, text)
            if (front && back) {
                dispatch(setFront(front))
                dispatch(setBack(back)) 
            }
            setLoadingGetResult(false);
            setShowResult(true);
        }
    };

    const handleSaveAISettings = () => {
        dispatch(setAIInstructions(localAIInstructions));
        setShowAISettings(false);
        showError('AI settings saved successfully!', 'success');
    };

    const handleSaveImageSettings = () => {
        dispatch(setImageInstructions(localImageInstructions));
        setShowImageSettings(false);
        showError('Image instructions saved successfully!', 'success');
    };
    
    // Render AI Settings Panel
    const renderAISettings = () => {
        if (!showAISettings) {
            return (
                <button
                    onClick={() => setShowAISettings(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        color: '#4B5563',
                        cursor: 'pointer',
                        width: '100%',
                        justifyContent: 'center'
                    }}
                >
                    <FaCog size={14} />
                    Customize AI behavior
                </button>
            );
        }
        
        return (
            <div style={{
                backgroundColor: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '16px',
                width: '100%',
                marginBottom: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <FaLightbulb size={14} color="#2563EB" />
                        AI Instructions
                    </h3>
                    <button
                        onClick={() => setShowAISettings(false)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6B7280',
                            fontSize: '13px'
                        }}
                    >
                        Cancel
                    </button>
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '4px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151'
                    }}>
                        Additional instructions for AI
                    </label>
                    <textarea
                        value={localAIInstructions}
                        onChange={(e) => setLocalAIInstructions(e.target.value)}
                        placeholder="E.g., Keep specialized terms untranslated. Make examples more advanced. Use formal language."
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #E5E7EB',
                            fontSize: '14px',
                            minHeight: '100px',
                            resize: 'vertical'
                        }}
                    />
                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '8px', lineHeight: '1.4' }}>
                        <p style={{ margin: '0 0 6px 0', fontWeight: '500' }}>How to use:</p>
                        <ul style={{ margin: 0, paddingLeft: '16px' }}>
                            <li>These are <strong>additional</strong> instructions that supplement the basic AI behavior</li>
                            <li>The original word will always be used (no need to specify it)</li>
                            <li>Examples will always be generated for the word you're learning</li>
                            <li>Use this for style guidance, preferences, or special requirements</li>
                        </ul>
                    </div>
                </div>
                
                <button
                    onClick={handleSaveAISettings}
                    style={{
                        backgroundColor: '#2563EB',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}
                >
                    <FaCode size={14} />
                    Save Instructions
                </button>
            </div>
        );
    };

    // Render Image Settings Panel
    const renderImageSettings = () => {
        if (!shouldGenerateImage) return null;
        
        if (!showImageSettings) {
            return (
                <button
                    onClick={() => setShowImageSettings(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        color: '#4B5563',
                        cursor: 'pointer',
                        width: '100%',
                        justifyContent: 'center',
                        marginTop: '8px'
                    }}
                >
                    <FaImage size={14} />
                    Customize image generation
                </button>
            );
        }
        
        return (
            <div style={{
                backgroundColor: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '16px',
                width: '100%',
                marginBottom: '12px',
                marginTop: '8px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <FaImage size={14} color="#10B981" />
                        Image Instructions
                    </h3>
                    <button
                        onClick={() => setShowImageSettings(false)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6B7280',
                            fontSize: '13px'
                        }}
                    >
                        Cancel
                    </button>
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '4px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151'
                    }}>
                        Image generation style
                    </label>
                    <textarea
                        value={localImageInstructions}
                        onChange={(e) => setLocalImageInstructions(e.target.value)}
                        placeholder="E.g., use anime style, make it minimalist, use pastel colors, make it black and white"
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #E5E7EB',
                            fontSize: '14px',
                            minHeight: '100px',
                            resize: 'vertical'
                        }}
                    />
                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '8px', lineHeight: '1.4' }}>
                        <p style={{ margin: '0 0 6px 0', fontWeight: '500' }}>How to use:</p>
                        <ul style={{ margin: 0, paddingLeft: '16px' }}>
                            <li>These are <strong>style instructions</strong> for image generation</li>
                            <li>The image will still be related to the word you're learning</li>
                            <li>Focus on artistic style, mood, colors, composition, etc.</li>
                            <li>Examples: "watercolor style", "dark background", "realistic rendering"</li>
                        </ul>
                    </div>
                </div>
                
                <button
                    onClick={handleSaveImageSettings}
                    style={{
                        backgroundColor: '#10B981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}
                >
                    <FaImage size={14} />
                    Save Image Instructions
                </button>
            </div>
        );
    };

    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '12px',
        width: '100%',
        padding: '12px',
        paddingTop: '16px',
        height: '100%',
        overflowY: 'auto',
        backgroundColor: '#ffffff',
        paddingBottom: '16px'
      }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
            maxWidth: '320px'
          }}>
              {mode === Modes.LanguageLearning && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  width: '100%',
                  gap: '8px'
                }}>
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                        <label htmlFor="language" style={{
                          color: '#111827',
                          fontWeight: '600',
                          fontSize: '14px',
                          margin: 0
                        }}>Translate to:</label>
                    </div>
                    <select
                      id="language"
                      value={translateToLanguage}
                      onChange={(e) => dispatch(setTranslateToLanguage(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #E5E7EB',
                        backgroundColor: '#ffffff',
                        color: '#374151',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                      onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                    >
                        {popularLanguages.map(({ code, name }) => (
                          <option key={code} value={code}>
                              {name}
                          </option>
                        ))}
                    </select>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      width: '100%'
                    }}>
                        <label htmlFor="generateImage" style={{
                          color: '#111827',
                          fontWeight: '600',
                          fontSize: '14px',
                          margin: 0
                        }}>Image:</label>
                        <div style={{
                          position: 'relative',
                          display: 'inline-block',
                          width: '40px',
                          height: '22px'
                        }}>
                            <input
                              type="checkbox"
                              id="generateImage"
                              checked={shouldGenerateImage}
                              onChange={handleImageToggle}
                              style={{
                                opacity: 0,
                                width: 0,
                                height: 0
                              }}
                            />
                            <label
                              htmlFor="generateImage"
                              style={{
                                position: 'absolute',
                                cursor: 'pointer',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: shouldGenerateImage ? '#2563EB' : '#E5E7EB',
                                transition: '.3s',
                                borderRadius: '22px'
                              }}
                            >
                                <span style={{
                                  position: 'absolute',
                                  content: '""',
                                  height: '18px',
                                  width: '18px',
                                  left: '2px',
                                  bottom: '2px',
                                  backgroundColor: 'white',
                                  transition: '.3s',
                                  borderRadius: '50%',
                                  transform: shouldGenerateImage ? 'translateX(18px)' : 'translateX(0)'
                                }} />
                            </label>
                        </div>
                    </div>
                    {shouldGenerateImage && renderImageSettings()}
                </div>
              )}
              
              {renderAISettings()}
              
              <form onSubmit={handleSubmit} style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginTop: '4px',
                marginBottom: '0'
              }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    width: '100%'
                  }}>
                      <label htmlFor="text" style={{
                        color: '#111827',
                        fontWeight: '600',
                        fontSize: '14px'
                      }}>Text:</label>
                      <textarea
                        id="text"
                        value={text}
                        onChange={(e) => dispatch(setText(e.target.value))}
                        placeholder="Enter text to translate or select text from a webpage"
                        style={{
                          width: '100%',
                          minHeight: '80px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #E5E7EB',
                          backgroundColor: '#ffffff',
                          color: '#374151',
                          fontSize: '14px',
                          resize: 'vertical',
                          outline: 'none',
                          transition: 'all 0.2s ease'
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                        onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                      />
                  </div>
                  <button
                    type="submit"
                    disabled={loadingGetResult}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      marginTop: '4px',
                      borderRadius: '6px',
                      backgroundColor: '#2563EB',
                      color: '#ffffff',
                      fontWeight: '600',
                      fontSize: '14px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      opacity: loadingGetResult ? 0.7 : 1
                    }}
                    onMouseOver={(e) => !loadingGetResult && (e.currentTarget.style.backgroundColor = '#1D4ED8')}
                    onMouseOut={(e) => !loadingGetResult && (e.currentTarget.style.backgroundColor = '#2563EB')}
                  >
                      {loadingGetResult ? 'Processing...' : 'Create Card'}
                  </button>
              </form>
              <div style={{
                width: '100%',
                margin: '4px 0 0 0'
              }}>
                  {renderErrorNotification()}
              </div>
          </div>
          {showResult && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              maxWidth: '320px',
              marginBottom: '8px'
            }}>
                <div style={{
                  width: '100%',
                  marginBottom: '12px'
                }}>
                    <div style={{
                      position: 'relative',
                      width: '100%',
                    }}>
                        <input
                          type="text"
                          value={customInstruction}
                          onChange={(e) => setCustomInstruction(e.target.value)}
                          onKeyDown={handleCustomInstructionKeyDown}
                          placeholder="Enter custom instructions (e.g., 'more formal examples', 'change image style')"
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            paddingRight: '40px',
                            borderRadius: '6px',
                            border: '1px solid #E5E7EB',
                            fontSize: '14px',
                            color: '#374151',
                          }}
                          disabled={isProcessingCustomInstruction}
                        />
                        <button
                          onClick={handleApplyCustomInstruction}
                          disabled={!customInstruction.trim() || isProcessingCustomInstruction}
                          style={{
                            position: 'absolute',
                            right: '8px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: customInstruction.trim() && !isProcessingCustomInstruction ? '#2563EB' : '#9CA3AF',
                            cursor: customInstruction.trim() && !isProcessingCustomInstruction ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '4px'
                          }}
                        >
                          <FaMagic size={16} />
                        </button>
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6B7280',
                      marginTop: '4px',
                    }}>
                      {isProcessingCustomInstruction ? 'Applying your instructions...' : 'Type instructions and press Enter or click the magic wand'}
                    </div>
                </div>
                
                <ResultDisplay
                  front={front}
                  back={back}
                  translation={translation}
                  examples={examples}
                  imageUrl={imageUrl}
                  image={image}
                  onNewImage={handleNewImage}
                  onNewExamples={handleNewExamples}
                  onAccept={handleAccept}
                  onViewSavedCards={handleViewSavedCards}
                  mode={mode}
                  shouldGenerateImage={shouldGenerateImage}
                  loadingNewImage={loadingNewImage}
                  loadingNewExamples={loadingNewExamples}
                  loadingAccept={loadingAccept}
                />
            </div>
          )}
      </div>
    );
};

export default CreateCard;
