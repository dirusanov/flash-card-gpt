import React from 'react';

interface ResultDisplayProps {
    front: string | null
    translation: string | null;
    examples: Array<[string, string | null]>;
    imageUrl: string | null;
    onNewImage: () => void;
    onNewExamples: () => void;
    onSave: () => void;
}

const ResultDisplay: React.FC<ResultDisplayProps> = ({ front, translation, examples, imageUrl, onNewImage, onNewExamples, onSave }) => {
    return (
        <div className="bg-white p-4 rounded shadow-md w-full max-w-md">
            {front && (
                <div className="mb-4">
                    <h3 className="text-xl font-bold text-center my-2">{front}</h3>
                </div>
            )}
            <hr className="my-4 border-gray-300" />
            {translation && (
                <div className="mb-4 text-center">
                    <p className="font-bold">{translation}</p>
                </div>
            )}
            {examples.length > 0 && (
                <div className="mb-4">
                    <ul>
                        {examples.map(([example, translatedExample]) => (
                            <li key={example}>
                                {example}
                                {translatedExample && <span> - {translatedExample}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {imageUrl && (
                <div className="mb-4">
                    <img src={imageUrl} alt="Generated representation" className="rounded" />
                </div>
            )}
            <div className="flex space-x-4">
                {imageUrl && (
                    <button onClick={onNewImage} className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded w-full max-w-sm">
                        New Image
                    </button>
                )}
                {examples.length > 0 && (
                    <button onClick={onNewExamples} className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded w-full max-w-sm">
                        New Examples
                    </button>
                )}
            </div>
            <button onClick={onSave} className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded w-full mt-4">
                Save
            </button>
        </div>
    );
};

export default ResultDisplay;
