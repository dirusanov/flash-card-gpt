import React, {useEffect, useState} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { FaCog } from 'react-icons/fa';
import {RootState} from "../store";
import {setDeckId} from "../store/actions/decks";
import {saveAnkiCards, setBack, setExamples, setImage, setImageUrl, setTranslation, setText} from "../store/actions/cards";
import { CardLangLearning, CardGeneral } from '../services/ankiService';
import {generateAnkiBack, generateAnkiFront, getDescriptionImage, getExamples, translateText} from "../services/openaiApi";
import { setMode, setShouldGenerateImage, setTranslateToLanguage} from "../store/actions/settings";
import {Modes} from "../constants";
import ResultDisplay from "./ResultDisplay";
import { Configuration, OpenAIApi } from 'openai';
import { getImage } from '../apiUtils';


interface CreateCardProps {
    onSettingsClick: () => void;
}

const CreateCard: React.FC<CreateCardProps> = ({ onSettingsClick }) => {
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
    const [loadingSave, setLoadingSave] = useState(false);
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const haggingFaceApiKey = useSelector((state: RootState) => state.settings.huggingFaceApiKey);
    const shouldGenerateImage = useSelector((state: RootState) => state.settings.shouldGenerateImage);
    const configuration = new Configuration({
        apiKey: openAiKey,
    });
    const openai = new OpenAIApi(configuration);

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
        onSettingsClick();
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

    const handleSave = () => {
        setLoadingSave(true)
        const modelName = 'Basic';

        if (mode == Modes.LanguageLearning) {
            if (!text || !translation) {
                alert('Some required data is missing. Please make sure you have all the required data before saving.');
                return;
            }
            const cards: CardLangLearning[] = [
                {
                    text: text,
                    translation: translation,
                    examples: examples,
                    image_base64: image,
                },
            ];
            dispatch(saveAnkiCards(mode, ankiConnectUrl, ankiConnectApiKey, deckId, modelName, cards));
        }
        else if (mode == Modes.GeneralTopic && back) {
            const cards: CardGeneral[] = [
                {
                    front: front,
                    back: back,
                    text: text,
                },
            ];
            dispatch(saveAnkiCards(mode, ankiConnectUrl, ankiConnectApiKey, deckId, modelName, cards));
        }
        setTimeout(() => {
            setLoadingSave(false);
        }, 1000);     
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
      <div className="flex flex-col items-center justify-start space-y-4 w-full px-4 h-screen overflow-y-auto">
          <div className="flex flex-col items-center space-y-4 w-full max-w-full"> {/* Ограничение ширины контента */}
              {mode === Modes.LanguageLearning && (
                <div className="flex flex-col items-center w-full">
                    <div className="relative w-full mb-2 mt-2">
                        <label htmlFor="language" className="text-gray-700 font-bold text-center block">Translate
                            to:</label>
                        <button
                          onClick={handleSettingsClick}
                          className="absolute top-0 right-0 text-2xl"
                          style={{ paddingRight: '16px' }} // Жестко заданный отступ справа
                        >
                            <FaCog />
                        </button>
                    </div>
                    <select
                      id="language"
                      value={translateToLanguage}
                      onChange={(e) => dispatch(setTranslateToLanguage(e.target.value))}
                      className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600"
                    >
                        {popularLanguages.map(({ code, name }) => (
                          <option key={code} value={code}>
                              {name}
                          </option>
                        ))}
                    </select>
                    <div className="flex items-center mt-2 space-x-4 self-start">
                        <label htmlFor="generateImage" className="text-gray-700 font-bold">Image:</label>
                        <div
                          className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                            <input
                              type="checkbox"
                              id="generateImage"
                              checked={shouldGenerateImage}
                              onChange={handleImageToggle}
                              className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                            />
                            <label htmlFor="generateImage"
                                   className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                        </div>
                    </div>
                </div>
              )}
              {useAnkiConnect && decks && (
                <div className="flex flex-col items-center w-full">
                    <label htmlFor="language" className="text-gray-700 font-bold">Decks:</label>
                    <select
                      value={deckId}
                      onChange={(e) => dispatch(setDeckId(e.target.value))}
                      className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600"
                    >
                        {decks.map((deckName: string) => (
                          <option key={deckName} value={deckName}>
                              {deckName}
                          </option>
                        ))}
                    </select>
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col space-y-4 w-full">
        <textarea
          value={text}
          onChange={(e) => dispatch(setText(e.target.value))}
          placeholder="Enter what you want to learn"
          className="border-2 border-gray-300 p-2 rounded resize-y"
          rows={4}
        />
                  <button
                    type="submit"
                    disabled={loadingGetResult}
                    className={`text-white font-bold py-2 px-4 rounded 
                ${loadingGetResult ? 'loading-btn bg-blue-500' : 'bg-blue-500 hover:bg-blue-700'}`}
                  >
                      Start
                  </button>
              </form>
          </div>
          {showResult && (
            <div className="flex flex-col items-center space-y-4 w-full max-w-full overflow-y-auto">
                <ResultDisplay
                  front={front}
                  back={back}
                  translation={translation}
                  examples={examples}
                  imageUrl={imageUrl}
                  onNewImage={handleNewImage}
                  onNewExamples={handleNewExamples}
                  onSave={handleSave}
                  mode={mode}
                  loadingNewImage={loadingNewImage}
                  loadingNewExamples={loadingNewExamples}
                  loadingSave={loadingSave}
                  shouldGenerateImage={shouldGenerateImage}
                />
            </div>
          )}
      </div>
    );
};

export default CreateCard;
