import React, {useEffect, useState} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {fetchDecks, setDeckId} from '../../store/actions/decks';
import {
    saveAnkiCards,
    setWord,
    setTranslation,
    setExamples,
    setImage,
    setImageUrl,
} from '../../store/actions/cards';
import { translateText, getExamples, getDescriptionImage, getImageUrl } from "../../services/openaiApi";
import ResultDisplay from "../ResultDisplay"
import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { Card, imageUrlToBase64 } from "../../services/ankiService";
import {setSelectedLanguage} from "../../store/actions/languageActions";
import {useNavigate} from "react-router-dom";
import { FaCog } from 'react-icons/fa'; // Импорт иконки шестерёнки


const CreateCard: React.FC = () => {
    const [showResult, setShowResult] = useState(false);
    const deckId = useSelector((state: RootState) => state.deck.deckId);

    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();
    const { word, translation, examples, image, imageUrl } = useSelector((state: RootState) => state.cards);
    const selectedLanguage = useSelector((state: RootState) => state.language.selectedLanguage);
    const decks = useSelector((state: RootState) => state.deck.decks);

    const [showSettings, setShowSettings] = useState(false);
    const apiKey = useSelector((state: RootState) => state.settings.apiKey);
    const [selectedMode, setSelectedMode] = useState(null)

    const navigate = useNavigate();

    const handleSettingsClick = () => {
        navigate("/settings");
    };

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
        const descriptionImage = await getDescriptionImage(word);
        const newImageUrl = await getImageUrl(descriptionImage);
        dispatch(setImageUrl(newImageUrl));
        if (newImageUrl) {
            const imageBase64 = await imageUrlToBase64(newImageUrl);
            dispatch(setImage(imageBase64));
        }
    };

    const handleNewExamples = async () => {
        const newExamples = await getExamples(word, true);
        dispatch(setExamples(newExamples));
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

        dispatch(saveAnkiCards(deckId, modelName, cards));
    };

    useEffect(() => {
        dispatch(fetchDecks() as any);
        if (word && translation && examples.length > 0) {
            setShowResult(true);
        } else {
            setShowResult(false);
        }
    }, [dispatch]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setShowResult(false);

        // Получить перевод и другие данные с сервера
        const translatedText = await translateText(word, selectedLanguage);
        const examples = await getExamples(word,true);
        const descriptionImage = await getDescriptionImage(word);
        const imageUrl = await getImageUrl(descriptionImage);
        if (imageUrl) {
            const imageBase64 = await imageUrlToBase64(imageUrl);
            dispatch(setImage(imageBase64));
        }

        dispatch(setWord(word));
        dispatch(setTranslation(translatedText));
        dispatch(setExamples(examples));
        dispatch(setImageUrl(imageUrl));
        if (translatedText) {
            setShowResult(true)
        }
    };

    return (
        <div className="flex flex-col items-center justify-center space-y-4">
            <div className="flex items-center space-x-4 m-4">
                <button
                    onClick={handleSettingsClick}
                    className="text-2xl" // Классы Tailwind для стилизации кнопки
                >
                    <FaCog />
                </button>

                <div className="flex flex-col flex-grow">
                    <label htmlFor="mode" className="text-gray-700 font-bold mt-2">Mode:</label>
                    <select
                        id="mode"
                        value={selectedLanguage}
                        onChange={(e) => dispatch(setSelectedLanguage(e.target.value))}
                        className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600"
                    >
                        {popularLanguages.map(({ code, name }) => (
                            <option key={code} value={code}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col space-y-4">

                <div className="flex flex-col items-center">

                    <label htmlFor="language" className="text-gray-700 font-bold mt-2">Translate to:</label>
                    <select
                        id="language"
                        value={selectedLanguage}
                        onChange={(e) => dispatch(setSelectedLanguage(e.target.value))}
                        className="border-2 border-blue-500 p-2 rounded mt-2 w-full text-gray-600"
                    >
                        {popularLanguages.map(({ code, name }) => (
                            <option key={code} value={code}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col items-center">
                    <label htmlFor="language" className="text-gray-700 font-bold">Decks:</label>
                    {decks && (
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
                    )}
                </div>
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
            {showResult && (
                <div className="flex flex-col items-center space-y-4">
                    <ResultDisplay
                        front={word}
                        translation={translation}
                        examples={examples}
                        imageUrl={imageUrl}
                        onNewImage={handleNewImage}
                        onNewExamples={handleNewExamples}
                        onSave={handleSave}
                    />
                </div>
            )}
        </div>
    );
};

export default CreateCard;
