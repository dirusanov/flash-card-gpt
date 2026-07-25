import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { setAIInstructions, setImageInstructions } from '../../store/actions/settings';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { SettingsRow } from '../ui/SettingsList';

const STYLE_PRESETS: { label: string; instruction: string }[] = [
    {
        label: 'Photorealistic',
        instruction: 'Use photorealistic style with natural lighting and realistic materials.',
    },
    {
        label: 'Painting',
        instruction: 'Use painting style (oil painting), visible brush strokes and canvas texture.',
    },
];

// Presets replace each other rather than stacking, so clicking both does not leave the
// prompt asking for a photorealistic oil painting.
const STYLE_WORDS =
    /photoreal(?:istic)?|photo[-\s]?real|realistic|painting|painted|oil\s?painting|watercolor|brush|canvas|illustration|живопис|картина|маслом|акварел/gi;

const applyPreset = (existing: string, preset: string): string => {
    const stripped = (existing || '').replace(STYLE_WORDS, '').replace(/\s{2,}/g, ' ').trim();
    return stripped ? `${preset} ${stripped}` : preset;
};

const InstructionEditor: React.FC<{
    value: string;
    saved: string;
    onChange: (value: string) => void;
    onSave: () => void;
    placeholder: string;
    note: string;
    children?: React.ReactNode;
}> = ({ value, saved, onChange, onSave, placeholder, note, children }) => {
    const [justSaved, setJustSaved] = useState(false);
    const dirty = value !== saved;

    useEffect(() => {
        if (!justSaved) return undefined;
        const timer = setTimeout(() => setJustSaved(false), 2000);
        return () => clearTimeout(timer);
    }, [justSaved]);

    return (
        <div className="flex flex-col gap-2">
            <p className="m-0 text-xs leading-snug text-gray-500">{note}</p>
            {children}
            <Textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                minRows={3}
                placeholder={placeholder}
            />
            <div className="flex items-center gap-2">
                <Button
                    variant="primary"
                    size="sm"
                    disabled={!dirty}
                    onClick={() => {
                        onSave();
                        setJustSaved(true);
                    }}
                >
                    Save
                </Button>
                {justSaved && <span className="text-xs font-medium text-ok-strong">Saved</span>}
            </div>
        </div>
    );
};

// Whether images and audio are generated at all lives on the chips, where the current
// mode is visible. Only the wording and styling — which never change per card — are here.
const CardGenerationRows: React.FC = () => {
    const dispatch = useDispatch();
    const aiInstructions = useSelector((state: RootState) => state.settings.aiInstructions) || '';
    const imageInstructions =
        useSelector((state: RootState) => state.settings.imageInstructions) || '';

    const [localAi, setLocalAi] = useState(aiInstructions);
    const [localImage, setLocalImage] = useState(imageInstructions);

    useEffect(() => setLocalAi(aiInstructions), [aiInstructions]);
    useEffect(() => setLocalImage(imageInstructions), [imageInstructions]);

    return (
        <>
            <SettingsRow
                label="AI instructions"
                value={aiInstructions ? 'Custom' : 'Default'}
            >
                <InstructionEditor
                    value={localAi}
                    saved={aiInstructions}
                    onChange={setLocalAi}
                    onSave={() => dispatch(setAIInstructions(localAi))}
                    note="Added on top of the built-in behaviour. Use it for tone, level or special requirements — no need to restate the basics."
                    placeholder="E.g. keep specialised terms untranslated, make examples more advanced, use formal language."
                />
            </SettingsRow>

            <SettingsRow
                label="Image style"
                value={imageInstructions ? 'Custom' : 'Default'}
            >
                <InstructionEditor
                    value={localImage}
                    saved={imageInstructions}
                    onChange={setLocalImage}
                    onSave={() => dispatch(setImageInstructions(localImage))}
                    note="Affects how pictures look, not what they show — the subject always follows the word you are learning."
                    placeholder="E.g. minimalist, pastel colours, dark background, black and white."
                >
                    <div className="flex flex-wrap gap-1.5">
                        {STYLE_PRESETS.map((preset) => (
                            <Button
                                key={preset.label}
                                size="sm"
                                onClick={() =>
                                    setLocalImage(applyPreset(localImage, preset.instruction))
                                }
                            >
                                {preset.label}
                            </Button>
                        ))}
                    </div>
                </InstructionEditor>
            </SettingsRow>
        </>
    );
};

export default CardGenerationRows;
