import React from 'react';
import { FaTimes, FaLightbulb, FaEdit } from 'react-icons/fa';
import Loader from '../Loader';

interface RecreateCardModalProps {
    show: boolean;
    onClose: () => void;
    onConfirm: () => void;
    comments: string;
    setComments: (val: string) => void;
    loading: boolean;
}

const RecreateCardModal: React.FC<RecreateCardModalProps> = ({
    show,
    onClose,
    onConfirm,
    comments,
    setComments,
    loading,
}) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-5">
            <div className="flex max-h-[80vh] w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
                    <div>
                        <h3 className="m-0 text-lg font-semibold text-black">Improve Card</h3>
                        <p className="m-0 mt-1 text-[13px] text-gray-500">Provide feedback to create a better version</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded p-1 text-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                    >
                        <FaTimes />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-6">
                    <textarea
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="E.g., Make the question more specific, simplify the answer, add more context..."
                        className="min-h-[140px] w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed outline-none transition-colors focus:border-blue-600 focus:bg-white"
                    />

                    <div className="mt-4 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                        <FaLightbulb size={14} className="mt-0.5 shrink-0 text-gray-400" />
                        <span className="text-[13px] text-gray-500">Be specific about what you want to change for better results</span>
                    </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-6 py-5">
                    <button
                        onClick={onClose}
                        className="rounded-md px-3 py-2 text-[13px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex min-w-[120px] items-center justify-center gap-1.5 rounded-md bg-black px-4 py-2 text-[13px] font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                    >
                        {loading ? (
                            <><Loader type="spinner" size="small" inline color="#9CA3AF" /> Improving...</>
                        ) : (
                            <><FaEdit size={11} /> Improve Card</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecreateCardModal;
