import React from 'react';
import { FaCog, FaLightbulb, FaCode } from 'react-icons/fa';

interface AISettingsPanelProps {
    showAISettings: boolean;
    setShowAISettings: (show: boolean) => void;
    localAIInstructions: string;
    setLocalAIInstructions: (val: string) => void;
    onSave: () => void;
}

const AISettingsPanel: React.FC<AISettingsPanelProps> = ({
    showAISettings,
    setShowAISettings,
    localAIInstructions,
    setLocalAIInstructions,
    onSave,
}) => {
    if (!showAISettings) {
        return (
            <button
                onClick={() => setShowAISettings(true)}
                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-[13px] text-gray-600 transition-colors hover:bg-gray-200"
            >
                <FaCog size={14} />
                Customize AI behavior
            </button>
        );
    }

    return (
        <div className="mb-3 w-full rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="m-0 flex items-center gap-2 text-base font-semibold text-gray-900">
                    <FaLightbulb size={14} className="text-blue-600" />
                    AI Instructions
                </h3>
                <button
                    onClick={() => setShowAISettings(false)}
                    className="text-[13px] text-gray-500 hover:text-gray-700"
                >
                    Cancel
                </button>
            </div>

            <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                    Additional instructions for AI
                </label>
                <textarea
                    value={localAIInstructions}
                    onChange={(e) => setLocalAIInstructions(e.target.value)}
                    placeholder="E.g., Keep specialized terms untranslated. Make examples more advanced. Use formal language."
                    className="min-h-[100px] w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600"
                />
                <div className="mt-2 text-xs leading-relaxed text-gray-500">
                    <p className="mb-1.5 mt-0 font-medium">How to use:</p>
                    <ul className="m-0 list-disc pl-4">
                        <li>These are additional instructions that supplement core behavior</li>
                        <li>No need to repeat basic rules</li>
                        <li>Focus on style, level, or special requirements</li>
                    </ul>
                </div>
            </div>

            <button
                onClick={onSave}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
                <FaCode size={14} />
                Save Instructions
            </button>
        </div>
    );
};

export default AISettingsPanel;
