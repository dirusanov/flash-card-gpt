import React, {useEffect, useState} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import {RootState} from "../store";
import {setDeckId} from "../store/actions/decks";
import {saveCardToStorage, setBack, setExamples, setImage, setImageUrl, setTranslation, setText, loadStoredCards} from "../store/actions/cards";
import { CardLangLearning, CardGeneral } from '../services/ankiService';
import {generateAnkiBack, generateAnkiFront, getDescriptionImage, getExamples, translateText} from "../services/openaiApi";
import { setMode, setShouldGenerateImage, setTranslateToLanguage} from "../store/actions/settings";
import {Modes} from "../constants";
import ResultDisplay from "./ResultDisplay";
import { OpenAI } from 'openai';
import { getImage } from '../apiUtils';
import useErrorNotification from './useErrorHandler';
import { setCurrentPage } from "../store/actions/page";


interface CreateCardProps {
    // Пустой интерфейс, так как больше не нужен onSettingsClick
}

const CreateCard: React.FC<CreateCardProps> = () => {
    const [showResult, setShowResult] = useState(false);
    const deckId = useSelector((state: RootState) => state.deck.deckId);

    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();
    const { text, translation, examples, image, imageUrl } = useSelector((state: RootState) => state.cards);
    const translateToLanguage = useSelector((state: RootState) => state.settings.translateToLanguage);
    const decks = useSelector((state: RootState) => state.deck.decks);
    const mode = useSelector((state: RootState) => state.settings.mode);
    const [front, setFront] = useState('');
    const back = useSelector((state: RootState) => state.cards.back);
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
    const { showError, renderErrorNotification } = useErrorNotification()
    const openai = new OpenAI({
        apiKey: openAiKey,
        dangerouslyAllowBrowser: true,
    });

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
        const descriptionImage = await getDescriptionImage(openAiKey, text);
        const { imageUrl, imageBase64 } = await getImage(haggingFaceApiKey, openai, openAiKey, descriptionImage);

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

    const handleSettingsClick = () => {
        // Эта функция больше не нужна, но оставим ее пустой, чтобы не рефакторить весь код
    };

    const handleImageToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        // TODO если не была нажата Get Result, то возвращать тоже изображение
        const isChecked = e.target.checked;
        dispatch(setShouldGenerateImage(isChecked));
    
        if (isChecked) {
            const descriptionImage = await getDescriptionImage(openAiKey, text);
            const { imageUrl, imageBase64 } = await getImage(haggingFaceApiKey, openai, openAiKey, descriptionImage)
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
                if (!text || !translation) {
                    showError('Some required data is missing. Please make sure you have all the required data before saving.');
                    return;
                }
                
                // Save to localStorage only
                dispatch(saveCardToStorage({
                    mode,
                    text,
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
                    text,
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
            setFront(text);
            const translatedText = await translateText(openAiKey, text, translateToLanguage)
            const examples = await getExamples(openAiKey, text, translateToLanguage, true)
            if (shouldGenerateImage) {
                const descriptionImage = await getDescriptionImage(openAiKey, text);
                const { imageUrl, imageBase64 } = await getImage(haggingFaceApiKey, openai, openAiKey, descriptionImage)

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
            setText(text);
            const front = await generateAnkiFront(openAiKey, text)
            const back = await generateAnkiBack(openAiKey, text)
            if (front && back) {
                setFront(front)
                dispatch(setBack(back)) 
            }
            setLoadingGetResult(false);
            setShowResult(true);
        }
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
                </div>
              )}
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
