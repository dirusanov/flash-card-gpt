import React from 'react';

import { Modes } from "../constants";

interface ResultDisplayProps {
    front: string | null
    back: string | null
    translation: string | null;
    examples: Array<[string, string | null]>;
    imageUrl: string | null;
    onNewImage: () => void;
    onNewExamples: () => void;
    onSave: () => void;
    mode: Modes; 
    loadingNewImage: boolean
    loadingNewExamples: boolean
    loadingSave: boolean
    shouldGenerateImage: boolean
}

const ResultDisplay: React.FC<ResultDisplayProps> = (
        { 
            front, 
            back, 
            translation, 
            examples, 
            imageUrl, 
            onNewImage, 
            onNewExamples, 
            onSave, 
            mode, 
            loadingNewImage, 
            loadingNewExamples, 
            loadingSave, 
            shouldGenerateImage 
        }
    ) => {
    return (
        <div className="bg-white p-4 rounded shadow-md w-full max-w-md">
            {front && (
                <div className="mb-4">
                    <h3 className="text-xl font-bold text-center my-2">{front}</h3>
                </div>
            )}
            {mode === Modes.GeneralTopic && back && (
                <div className="mb-4">
                    {back.replace("Key Points", "").split("-").filter(point => point.trim() !== '').map((point, index) => (
                        <li key={index} className="mb-4">{point}</li>
                    ))}
                </div>
            )}
            {mode === Modes.LanguageLearning && (
                <>
                    <hr className="my-4 border-gray-300" />
                    {translation && (
                        <div className="mb-4 text-center">
                            <p className="font-bold">{translation}</p>
                        </div>
                    )}
                    <hr className="my-4 border-gray-300" />
                    {examples.length > 0 && (
                        <div className="mb-4">
                            <ul>
                                {examples.map(([example, translatedExample]) => (
                                    <li key={example}>
                                        <span className="font-semibold">{example.replace(/^(\d+\. )?"(.*)"$/, '$1$2').trim()}</span>
                                        {translatedExample && (
                                            <>
                                                <br />
                                                <span>
                                        <em>{translatedExample.replace(/^(\d+\. )?"(.*)"$/, '$2').trim()}</em>
                                    </span>
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <hr className="my-4 border-gray-300" />
                    {shouldGenerateImage && imageUrl && (
                        <div className="mb-4">
                            <img src={imageUrl} alt="" className="rounded" />
                        </div>
                    )}
                    <div className="flex space-x-4">
                        {imageUrl && (
                            <button 
                                onClick={onNewImage} 
                                disabled={loadingNewImage}
                                className={`text-white font-bold py-2 px-4 rounded w-full max-w-sm ${loadingNewImage ? 'loading-btn bg-yellow-500' : 'bg-yellow-500 hover:bg-yellow-700'}`}
                            >
                                New Image
                            </button>
                        )}
                        {examples.length > 0 && (
                            <button 
                                onClick={onNewExamples} 
                                disabled={loadingNewExamples}
                                className={`text-white font-bold py-2 px-4 rounded w-full max-w-sm ${loadingNewExamples ? 'loading-btn bg-yellow-500' : 'bg-yellow-500 hover:bg-yellow-700'}`}
                            >
                                New Examples
                            </button>
                        )}
                    </div>
                </>
            )}
            <button 
                onClick={onSave} 
                disabled={loadingSave}
                className={`text-white font-bold py-2 px-4 rounded w-full mt-4 ${loadingSave ? 'loading-btn bg-green-500' : 'bg-green-500 hover:bg-green-700'}`}
            >
                Save
            </button>
        </div>
    );
};

export default ResultDisplay;
