import React from 'react';
import { FaFont, FaList, FaTimes } from 'react-icons/fa';
import Loader from '../Loader';

interface TextOptionsModalProps {
    show: boolean;
    textAnalysisLoader: boolean;
    selectedTextOptions: string[];
    selectedOptionsMap: Record<string, boolean>;
    setSelectedOptionsMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    setSelectedTextOptions: (opts: string[]) => void;
    onClose: () => void;
    onSelectOption: (option: string) => void;
    onCreate: () => void;
}

const TextOptionsModal: React.FC<TextOptionsModalProps> = ({
    show,
    textAnalysisLoader,
    selectedTextOptions,
    selectedOptionsMap,
    setSelectedOptionsMap,
    setSelectedTextOptions,
    onClose,
    onSelectOption,
    onCreate,
}) => {
    if (!show) return null;

    const selectedCount = Object.values(selectedOptionsMap).filter(Boolean).length;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="relative flex max-h-[90vh] w-full max-w-[360px] flex-col overflow-y-auto rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="sticky top-0 z-10 mb-4 flex items-center justify-between border-b border-gray-200 bg-white pb-3">
                    <h3 className="m-0 flex items-center gap-2 text-base font-semibold text-gray-900">
                        <FaFont size={14} className="text-blue-600" />
                        Select Terms for Cards
                    </h3>
                    <button
                        onClick={() => {
                            setSelectedOptionsMap({});
                            setSelectedTextOptions([]);
                            onClose();
                        }}
                        className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
                        aria-label="Close"
                    >
                        <FaTimes size={16} />
                    </button>
                </div>

                <div className="mb-3 flex items-center justify-between">
                    <p className="m-0 text-sm text-gray-600">Found {selectedTextOptions.length} key terms</p>
                    {selectedCount > 0 && (
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[13px] font-medium text-blue-600">{selectedCount} selected</span>
                    )}
                </div>

                <div className="mb-3 flex items-center justify-between px-1">
                    <button
                        onClick={() => {
                            const shouldSelectAll = selectedCount < selectedTextOptions.length;
                            const next: Record<string, boolean> = {};
                            selectedTextOptions.forEach((o) => {
                                next[o] = shouldSelectAll;
                            });
                            setSelectedOptionsMap(next);
                        }}
                        className="rounded px-2 py-1 text-[13px] text-gray-600 hover:bg-gray-100"
                    >
                        {selectedCount === selectedTextOptions.length ? '✓ Deselect all' : '☐ Select all'}
                    </button>
                    <span className="text-xs italic text-gray-500">Tap to select</span>
                </div>

                <div className="mb-4 flex max-h-[300px] flex-col gap-2 overflow-y-auto p-1">
                    {textAnalysisLoader ? (
                        <div className="flex justify-center p-5">
                            <Loader type="spinner" size="large" color="#3B82F6" text="Analyzing selected text..." />
                        </div>
                    ) : (
                        selectedTextOptions.map((option, index) => (
                            <div
                                key={index}
                                className={`relative flex cursor-pointer items-center rounded-md border p-2.5 transition-colors ${selectedOptionsMap[option] ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}
                                onClick={() => onSelectOption(option)}
                            >
                                <input
                                    type="checkbox"
                                    checked={!!selectedOptionsMap[option]}
                                    onChange={() => onSelectOption(option)}
                                    className="mr-3 h-4 w-4 min-w-4 accent-blue-600"
                                    id={`option-${index}`}
                                />
                                <span className="inline-block flex-1 break-words pr-12 text-left text-sm text-gray-700">{option.replace(/^[-–—•\s]+/, '')}</span>
                                <span className={`absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] ${option.split(/\s+/).length > 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-500'}`}>
                                    {option.split(/\s+/).length > 1 ? 'phrase' : 'word'}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-2 flex gap-2">
                    <button
                        onClick={() => {
                            setSelectedOptionsMap({});
                            onClose();
                        }}
                        className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={onCreate}
                        disabled={selectedCount === 0}
                        className="flex flex-[2] items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                    >
                        <FaList size={14} />
                        Create {selectedCount > 0 ? `${selectedCount} Card${selectedCount > 1 ? 's' : ''}` : 'Cards'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TextOptionsModal;
