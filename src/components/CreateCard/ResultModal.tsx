import React from 'react';
import { FaCheck, FaMagic, FaTimes } from 'react-icons/fa';
import ResultDisplay from '../ResultDisplay';
import Loader from '../Loader';
import { Modes } from '../../constants';
import { StoredCard } from '../../store/reducers/cards';

interface ResultModalProps {
    show: boolean;
    showResult: boolean;
    isMultipleCards: boolean;
    currentCardIndex: number;
    createdCards: StoredCard[];
    loadingAccept: boolean;
    explicitlySavedIds: string[];
    customInstruction: string;
    setCustomInstruction: (value: string) => void;
    isProcessingCustomInstruction: boolean;
    onCustomInstructionKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onApplyCustomInstruction: () => void;
    onClose: () => void;
    onPrevCard: () => void;
    onNextCard: () => void;
    onSaveAllCards: () => void;
    isCardExplicitlySaved: (id: string) => boolean;
    mode: Modes;
    front: string | null;
    translation: string | null;
    examples: Array<[string, string | null]>;
    examplesAudio: Array<string | null>;
    imageUrl: string | null;
    image: string | null;
    linguisticInfo: string | undefined;
    transcription: string | null;
    wordAudio: string | null;
    onNewImage: () => void;
    onNewExamples: () => void;
    onGenerateAudio: () => void;
    onAccept: () => void;
    onViewSavedCards?: () => void;
    onCancel: () => void;
    loadingNewImage: boolean;
    loadingNewExamples: boolean;
    loadingWordAudio: boolean;
    loadingGetResult: boolean;
    shouldGenerateImage: boolean;
    isSaved: boolean;
    isEdited: boolean;
    isGeneratingCard: boolean;
    setTranslation: (translation: string) => void;
    setBack: (back: string) => void;
    setExamples: (examples: Array<[string, string | null]>) => void;
    setLinguisticInfo: (info: string) => void;
}

const ResultModal: React.FC<ResultModalProps> = ({
    show,
    showResult,
    isMultipleCards,
    currentCardIndex,
    createdCards,
    loadingAccept,
    explicitlySavedIds,
    customInstruction,
    setCustomInstruction,
    isProcessingCustomInstruction,
    onCustomInstructionKeyDown,
    onApplyCustomInstruction,
    onClose,
    onPrevCard,
    onNextCard,
    onSaveAllCards,
    isCardExplicitlySaved,
    mode,
    front,
    translation,
    examples,
    examplesAudio,
    imageUrl,
    image,
    linguisticInfo,
    transcription,
    wordAudio,
    onNewImage,
    onNewExamples,
    onGenerateAudio,
    onAccept,
    onViewSavedCards,
    onCancel,
    loadingNewImage,
    loadingNewExamples,
    loadingWordAudio,
    loadingGetResult,
    shouldGenerateImage,
    isSaved,
    isEdited,
    isGeneratingCard,
    setTranslation,
    setBack,
    setExamples,
    setLinguisticInfo,
}) => {
    if (!show || !showResult) return null;

    return (
        <div className="absolute inset-0 z-[1000] flex justify-center overflow-y-auto overflow-x-hidden bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="relative m-auto max-h-[calc(100%-32px)] w-full max-w-[340px] overflow-y-auto rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 z-10 mb-4 flex items-center justify-between border-b border-gray-200 bg-white pb-3">
                    {isMultipleCards ? (
                        <h3 className="m-0 text-base font-semibold text-gray-900">Card {currentCardIndex + 1} of {createdCards.length}</h3>
                    ) : <div />}
                    <button onClick={onClose} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
                        <FaTimes size={16} />
                    </button>
                </div>

                <div className="mb-3 w-full">
                    <div className="relative w-full">
                        <input
                            type="text"
                            value={customInstruction}
                            onChange={(e) => setCustomInstruction(e.target.value)}
                            onKeyDown={onCustomInstructionKeyDown}
                            placeholder="Enter custom instructions (e.g., 'more formal examples', 'change image style')"
                            className={`w-full rounded-lg border border-gray-200 px-3 py-2 pr-11 text-sm text-gray-700 outline-none ${isProcessingCustomInstruction ? 'bg-gray-50 shadow-inner' : 'bg-white'}`}
                            disabled={isProcessingCustomInstruction}
                        />
                        {isProcessingCustomInstruction ? (
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-indigo-600">
                                <Loader type="spinner" size="small" inline color="#4F46E5" />
                            </div>
                        ) : (
                            <button
                                onClick={onApplyCustomInstruction}
                                disabled={!customInstruction.trim() || isProcessingCustomInstruction}
                                className={`absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full ${customInstruction.trim() ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-sm' : 'text-gray-400'}`}
                                title="Apply instructions"
                            >
                                <FaMagic size={14} />
                            </button>
                        )}
                    </div>
                    <div className={`mt-1.5 flex items-center gap-1.5 text-xs ${isProcessingCustomInstruction ? 'font-medium text-indigo-600' : 'text-gray-500'}`}>
                        {isProcessingCustomInstruction && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-600" />}
                        {isProcessingCustomInstruction ? 'Applying your instructions...' : 'Type instructions and press Enter or click the magic wand'}
                    </div>
                </div>

                {isMultipleCards && (
                    <>
                        <div className="mb-2 flex justify-center">
                            <div className="flex items-center gap-1 rounded-full bg-gray-50 px-3 py-1 text-[13px] text-gray-600">
                                Card {currentCardIndex + 1} of {createdCards.length}
                                {createdCards[currentCardIndex] && isCardExplicitlySaved(createdCards[currentCardIndex].id) && (
                                    <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-600">
                                        <FaCheck size={8} /> SAVED
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="mb-3 flex gap-2">
                            <button
                                onClick={onPrevCard}
                                disabled={currentCardIndex === 0}
                                className="flex flex-1 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                                ← Prev
                            </button>
                            <button
                                onClick={onNextCard}
                                disabled={currentCardIndex === createdCards.length - 1}
                                className="flex flex-1 items-center justify-end gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400"
                            >
                                Next →
                            </button>
                        </div>

                        <button
                            onClick={onSaveAllCards}
                            disabled={loadingAccept}
                            className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-500 px-3 py-2.5 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {loadingAccept ? (
                                <Loader type="spinner" size="small" inline color="#ffffff" text="Saving" />
                            ) : explicitlySavedIds.length > 0 ? (
                                <>Save {createdCards.length - explicitlySavedIds.length} Remaining Cards <span className="rounded bg-white/25 px-1.5 py-0.5 text-[11px]">{explicitlySavedIds.length} saved</span></>
                            ) : (
                                <>Save All Cards ({createdCards.length})</>
                            )}
                        </button>
                    </>
                )}

                <ResultDisplay
                    mode={mode}
                    front={front}
                    translation={translation}
                    examples={examples}
                    examplesAudio={examplesAudio}
                    imageUrl={imageUrl}
                    image={image}
                    linguisticInfo={linguisticInfo}
                    transcription={transcription}
                    wordAudio={wordAudio}
                    onNewImage={onNewImage}
                    onNewExamples={onNewExamples}
                    onGenerateAudio={onGenerateAudio}
                    onAccept={onAccept}
                    onViewSavedCards={onViewSavedCards || (() => {})}
                    onCancel={onCancel}
                    loadingNewImage={loadingNewImage}
                    loadingNewExamples={loadingNewExamples}
                    loadingAudio={loadingWordAudio}
                    createdAt={new Date()}
                    loadingAccept={loadingAccept}
                    loadingGetResult={loadingGetResult}
                    shouldGenerateImage={shouldGenerateImage}
                    isSaved={isSaved}
                    isEdited={isEdited}
                    isGeneratingCard={isGeneratingCard}
                    setTranslation={setTranslation}
                    setBack={setBack}
                    setExamples={setExamples}
                    setLinguisticInfo={setLinguisticInfo}
                />
            </div>
        </div>
    );
};

export default ResultModal;
