import React, {useEffect, useState} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { FaCog } from 'react-icons/fa';
import { FaSpinner } from 'react-icons/fa';
import {RootState} from "../store";
import {fetchDecks, setDeckId} from "../store/actions/decks";
import {saveAnkiCards, setExamples, setImage, setImageUrl, setTranslation, setWord} from "../store/actions/cards";
import {Card, imageUrlToBase64} from "../services/ankiService";
import {getDescriptionImage, getExamples, getImageUrl, translateText} from "../services/openaiApi";
import {setMode, setTranslateToLanguage} from "../store/actions/settings";
import {Modes} from "../constants";
import ResultDisplay from "./ResultDisplay";
import { Configuration, OpenAIApi } from 'openai';


interface CreateCardProps {
    onSettingsClick: () => void;
}

const CreateCard: React.FC<CreateCardProps> = ({ onSettingsClick }) => {
    const [showResult, setShowResult] = useState(false);
    const deckId = useSelector((state: RootState) => state.deck.deckId);

    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();
    const { word, translation, examples, image, imageUrl } = useSelector((state: RootState) => state.cards);
    const translateToLanguage = useSelector((state: RootState) => state.settings.translateToLanguage);
    const decks = useSelector((state: RootState) => state.deck.decks);
    const mode = useSelector((state: RootState) => state.settings.mode);
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const [loading, setLoading] = useState(false);
    const [displayWord, setDisplayWord] = useState('');
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
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
        const descriptionImage = await getDescriptionImage(openai, word);
        const newImageUrl = await getImageUrl(openai, descriptionImage);
        dispatch(setImageUrl(newImageUrl));
        if (newImageUrl) {
            const imageBase64 = await imageUrlToBase64(newImageUrl);
            dispatch(setImage(imageBase64));
        }
    };

    const handleNewExamples = async () => {
        const newExamples = await getExamples(openai, word, translateToLanguage, true);
        dispatch(setExamples(newExamples));
    };

    const handleSettingsClick = () => {
        onSettingsClick();
    };

    const handleSave = () => {
        const modelName = 'Basic';

        if (!word || !translation) {
            alert('Some required data is missing. Please make sure you have all the required data before saving.');
            return;
        }

        const cards: Card[] = [
            {
                word: word,
                translation: translation,
                examples: examples,
                image_base64: image,
            },
        ];

        dispatch(saveAnkiCards(ankiConnectUrl, ankiConnectApiKey, deckId, modelName, cards));
    };

    useEffect(() => {
        const handleMouseUp = () => {
            const selectedText = window.getSelection()?.toString().trim();
            if (selectedText) {
                dispatch(setWord(selectedText));
            }
        };
    
        document.addEventListener('mouseup', handleMouseUp);
    
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dispatch]);    

    useEffect(() => {
        dispatch(fetchDecks(ankiConnectApiKey) as any);
        if (word && translation && examples.length > 0) {
            setShowResult(true);
        } else {
            setShowResult(false);
        }
    }, [dispatch]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setShowResult(false);
        setLoading(true);

        setDisplayWord(word);
        const translatedText = await translateText(openai, word, translateToLanguage);
        const examples = await getExamples(openai, word, translateToLanguage, true);
        const descriptionImage = await getDescriptionImage(openai, word);
        const imageUrl = await getImageUrl(openai, descriptionImage);
        if (imageUrl) {
            const imageBase64 = await imageUrlToBase64(imageUrl);
            dispatch(setImage(imageBase64));
        }

        dispatch(setWord(word));
        dispatch(setTranslation(translatedText));
        dispatch(setExamples(examples));
        dispatch(setImageUrl(imageUrl));

        setLoading(false);
        if (translatedText) {
            setShowResult(true)
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
                        {/*<option value={Modes.GeneralTopic}>General Topic</option>*/}
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
                        value={word}
                        onChange={(e) => dispatch(setWord(e.target.value))}
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
                           front={displayWord}
                           translation={translation}
                           examples={examples}
                           imageUrl={imageUrl}
                           onNewImage={handleNewImage}
                           onNewExamples={handleNewExamples}
                           onSave={handleSave}
                        />
                    </div>
                )
            )}
        </div>
    );
};

export default CreateCard;