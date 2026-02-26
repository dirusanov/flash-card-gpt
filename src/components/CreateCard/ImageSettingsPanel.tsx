import React from 'react';
import { FaImage } from 'react-icons/fa';

interface ImageSettingsPanelProps {
    shouldGenerateImage: boolean;
    showImageSettings: boolean;
    setShowImageSettings: (show: boolean) => void;
    localImageInstructions: string;
    setLocalImageInstructions: (val: string) => void;
    onSave: () => void;
}

const ImageSettingsPanel: React.FC<ImageSettingsPanelProps> = ({
    shouldGenerateImage,
    showImageSettings,
    setShowImageSettings,
    localImageInstructions,
    setLocalImageInstructions,
    onSave,
}) => {
    if (!shouldGenerateImage) return null;

    if (!showImageSettings) {
        return (
            <button
                onClick={() => setShowImageSettings(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-[13px] text-gray-600 transition-colors hover:bg-gray-200"
            >
                <FaImage size={14} />
                Customize image generation
            </button>
        );
    }

    return (
        <div className="mb-3 mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="m-0 flex items-center gap-2 text-base font-semibold text-gray-900">
                    <FaImage size={14} className="text-emerald-600" />
                    Image Instructions
                </h3>
                <button
                    onClick={() => setShowImageSettings(false)}
                    className="text-[13px] text-gray-500 hover:text-gray-700"
                >
                    Cancel
                </button>
            </div>

            <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                    Instructions for image generation
                </label>

                <div className="mb-2 flex gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            const stripped = (localImageInstructions || '')
                                .replace(/photoreal(?:istic)?|photo[-\s]?real|realistic/gi, '')
                                .replace(/painting|painted|oil\s?painting|watercolor|brush|canvas|illustration|живопис|картина|маслом|акварел/gi, '')
                                .trim();
                            const preset = 'Use photorealistic style with natural lighting and realistic materials.';
                            setLocalImageInstructions(stripped ? `${preset} ${stripped}` : preset);
                        }}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                        Photorealistic
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            const stripped = (localImageInstructions || '')
                                .replace(/photoreal(?:istic)?|photo[-\s]?real|realistic/gi, '')
                                .replace(/painting|painted|oil\s?painting|watercolor|brush|canvas|illustration|живопис|картина|маслом|акварел/gi, '')
                                .trim();
                            const preset = 'Use painting style (oil painting), visible brush strokes and canvas texture.';
                            setLocalImageInstructions(stripped ? `${preset} ${stripped}` : preset);
                        }}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                        Painting
                    </button>
                </div>

                <textarea
                    value={localImageInstructions}
                    onChange={(e) => setLocalImageInstructions(e.target.value)}
                    placeholder="E.g., Minimalism style. Show only the object on a white background. Cinematic lighting."
                    className="min-h-[100px] w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600"
                />
                <div className="mt-2 text-xs leading-relaxed text-gray-500">
                    <p className="mb-1.5 mt-0 font-medium">How to use:</p>
                    <ul className="m-0 list-disc pl-4">
                        <li>These are style instructions for images</li>
                        <li>Specifying a clear style gives consistent results</li>
                        <li>You can specify content, mood, lighting, etc.</li>
                    </ul>
                </div>
            </div>

            <button
                onClick={onSave}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
                <FaImage size={14} />
                Save Image Instructions
            </button>
        </div>
    );
};

export default ImageSettingsPanel;
