import React, {useEffect, useState} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { FaCog } from 'react-icons/fa';
import { FaSpinner } from 'react-icons/fa';
import {RootState} from "../store";
import {fetchDecks, setDeckId} from "../store/actions/decks";
import {saveAnkiCards, setBack, setExamples, setImage, setImageUrl, setTranslation, setText} from "../store/actions/cards";
import {CardLangLearning, CardGeneral, imageUrlToBase64} from "../services/ankiService";
import {generateAnkiBack, generateAnkiFront, getDescriptionImage, getExamples, getOpenAiImageUrl, translateText} from "../services/openaiApi";
import {setMode, setTranslateToLanguage} from "../store/actions/settings";
import {Modes} from "../constants";
import ResultDisplay from "./ResultDisplay";
import { Configuration, OpenAIApi } from 'openai';
import { generateImageHuggingface } from '../services/huggingFaceApi';


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
    const [loading, setLoading] = useState(false);
    const [displayWord, setDisplayWord] = useState('');
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const haggingFaceAiKey = useSelector((state: RootState) => state.settings.huggingFaceApiKey);
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
        const descriptionImage = await getDescriptionImage(openAiKey, text);
        let newImageUrl: string | null = null;
        let imageBase64: string | null
        if (haggingFaceAiKey) {
            console.log('HUGGING LOL')
            console.log(descriptionImage)
            imageBase64 = await generateImageHuggingface(haggingFaceAiKey, descriptionImage);
            dispatch(setImage(image));
            newImageUrl = 'data:image/jpeg;base64,' + imageBase64.toString();
            dispatch(setImageUrl(newImageUrl));
        } else {
            newImageUrl = await getOpenAiImageUrl(openai, openAiKey, descriptionImage);
            if (newImageUrl) {
                dispatch(setImageUrl(newImageUrl));
                imageBase64 = await imageUrlToBase64(newImageUrl);
                dispatch(setImage(imageBase64));
            }
        }
    };

    const handleNewExamples = async () => {
        const newExamples = await getExamples(openAiKey, text, translateToLanguage, true);
        dispatch(setExamples(newExamples));
    };

    const handleSettingsClick = () => {
        onSettingsClick();
    };

    const handleSave = () => {
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
        dispatch(fetchDecks(ankiConnectApiKey) as any);
        if (text && translation && examples.length > 0) {
            setShowResult(true);
        } else {
            setShowResult(false);
        }
    }, [dispatch]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setShowResult(false);
        setLoading(true);
    
        if (mode === Modes.LanguageLearning) {
            setFront(text);
            const translatedText = await translateText(openAiKey, text, translateToLanguage);
            const examples = await getExamples(openAiKey, text, translateToLanguage, true);
            const descriptionImage = await getDescriptionImage(openAiKey, text);
            let imageUrl: string | null = null;
            let imageBase64: string | null
            if (haggingFaceAiKey) {
                console.log('HUGGING FACE!!!!!!')
                const imageBase64 = await generateImageHuggingface(haggingFaceAiKey, descriptionImage);
                dispatch(setImage(image));
                imageUrl = 'data:image/jpeg;base64,' + imageBase64.toString();
                dispatch(setImageUrl(imageUrl));
            } else {
                imageUrl = await getOpenAiImageUrl(openai, openAiKey, descriptionImage);
                if (imageUrl) {
                    dispatch(setImageUrl(imageUrl));
                    imageBase64 = await imageUrlToBase64(imageUrl);
                    dispatch(setImage(imageBase64));
                }
            }
            dispatch(setText(text));
            dispatch(setTranslation(translatedText));
            dispatch(setExamples(examples));
    
            setLoading(false);
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
            setLoading(false);
            setShowResult(true);
        }
    };
    

    return (
        <div className="flex flex-col items-center justify-center space-y-4 w-full px-4 h-screen overflow-scroll">

            <div className="flex flex-col items-center space-y-4 w-full"> {/* added w-full here */}
                <button
                    onClick={handleSettingsClick}
                    className="text-2xl absolute top-0 left-10 mt-2" // Изменено здесь
                >
                    <FaCog />
                </button>
                <div className="flex flex-col items-center w-full">
                    <label htmlFor="mode" className="text-gray-700 font-bold">Mode:</label>
                    <select
                        id="mode"
                        value={mode}
                        onChange={(e) => dispatch(setMode(e.target.value))}
                        className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600"
                    >
                        <option value={Modes.LanguageLearning}>Language Learning</option>
                        <option value={Modes.GeneralTopic}>General Topic</option>
                    </select>
                </div>
                {mode === Modes.LanguageLearning && (
                    <div className="flex flex-col items-center w-full">
                        <label htmlFor="language" className="text-gray-700 font-bold mt-2">Translate to:</label>
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
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    >
                        Get Result
                    </button>
                </form>
            </div>
            {loading ? (
                <div className="flex items-center justify-center">
                    <FaSpinner className="animate-spin" />
                </div>
            ) : (
                showResult && (
                    <div className="flex flex-col items-center space-y-4">
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
                        />
                    </div>
                )
            )}
        </div>
    );
};

export default CreateCard;
