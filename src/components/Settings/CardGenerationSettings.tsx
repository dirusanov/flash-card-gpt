import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import {
    setAIInstructions,
    setExampleTranscriptionsEnabled,
    setImageInstructions,
    setTranscriptionExtraLanguages,
    setTranscriptionLanguage,
    setTranscriptionMode,
} from '../../store/actions/settings';
import { findLanguage } from '../../data/languages';
import { TranscriptionMode } from '../../services/transcription';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { SettingsRow } from '../ui/SettingsList';
import LanguagePicker from '../CreateCard/LanguagePicker';
import Switch from '../ui/Switch';

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

const TRANSCRIPTION_MODES: Array<{
    value: TranscriptionMode;
    label: string;
    description: string;
}> = [
    {
        value: 'auto',
        label: 'Automatic',
        description: 'For scripts other than Latin and Cyrillic',
    },
    {
        value: 'always',
        label: 'Every language',
        description: 'Also add it to Latin and Cyrillic cards',
    },
    {
        value: 'off',
        label: 'Off',
        description: 'Do not generate a pronunciation guide or IPA',
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
    const transcriptionMode =
        useSelector((state: RootState) => state.settings.transcriptionMode) || 'auto';
    const transcriptionLanguage =
        useSelector((state: RootState) => state.settings.transcriptionLanguage) || 'en';
    const transcriptionExtraLanguages =
        useSelector((state: RootState) => state.settings.transcriptionExtraLanguages) || [];
    const exampleTranscriptionsEnabled = useSelector(
        (state: RootState) => state.settings.exampleTranscriptionsEnabled
    ) !== false;
    const [transcriptionPicker, setTranscriptionPicker] =
        useState<'guide' | 'extra' | null>(null);

    const [localAi, setLocalAi] = useState(aiInstructions);
    const [localImage, setLocalImage] = useState(imageInstructions);
    const selectedTranscriptionLanguage =
        findLanguage(transcriptionLanguage) || findLanguage('en');
    const transcriptionModeLabel =
        TRANSCRIPTION_MODES.find((option) => option.value === transcriptionMode)?.label
        || 'Automatic';
    const extraTranscriptionLanguages = transcriptionExtraLanguages
        .map((code) => findLanguage(code))
        .filter((language): language is NonNullable<ReturnType<typeof findLanguage>> =>
            Boolean(language)
        );

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

            <SettingsRow
                label="Pronunciation guide"
                value={
                    transcriptionMode === 'off'
                        ? 'Off'
                        : `${transcriptionModeLabel} · ${selectedTranscriptionLanguage?.englishName || 'English'}`
                }
            >
                <div className="flex flex-col gap-3">
                    <p className="m-0 text-xs leading-snug text-gray-500">
                        Adds a learner-friendly phonetic spelling and IPA. Automatic mode
                        turns it on when the studied text uses neither Latin nor Cyrillic.
                    </p>

                    <div className="flex flex-col gap-1.5">
                        {TRANSCRIPTION_MODES.map((option) => {
                            const selected = option.value === transcriptionMode;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => dispatch(setTranscriptionMode(option.value))}
                                    className={`flex items-start gap-2 rounded-control border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                        selected
                                            ? 'border-accent bg-accent-subtle'
                                            : 'border-line bg-white hover:bg-surface-sunken'
                                    }`}
                                >
                                    <span
                                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                                            selected
                                                ? 'border-accent bg-accent shadow-[inset_0_0_0_3px_white]'
                                                : 'border-gray-300 bg-white'
                                        }`}
                                        aria-hidden
                                    />
                                    <span className="flex min-w-0 flex-col">
                                        <span className="text-xs font-semibold text-gray-800">
                                            {option.label}
                                        </span>
                                        <span className="text-[11px] leading-snug text-gray-500">
                                            {option.description}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {transcriptionMode === 'auto' && (
                        <div className="flex flex-col gap-2 border-t border-line pt-3">
                            <span className="flex flex-col">
                                <span className="text-xs font-semibold text-gray-800">
                                    Additional source languages
                                </span>
                                <span className="text-[11px] leading-snug text-gray-500">
                                    Add Latin or Cyrillic languages that should also receive
                                    a pronunciation guide.
                                </span>
                            </span>

                            {extraTranscriptionLanguages.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {extraTranscriptionLanguages.map((language) => (
                                        <span
                                            key={language.code}
                                            className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-1 pl-2 pr-1 text-[11px] font-medium text-gray-700"
                                        >
                                            <span aria-hidden>{language.flag}</span>
                                            {language.englishName}
                                            <button
                                                type="button"
                                                aria-label={`Remove ${language.englishName}`}
                                                onClick={() =>
                                                    dispatch(setTranscriptionExtraLanguages(
                                                        transcriptionExtraLanguages.filter(
                                                            (code) => code !== language.code
                                                        )
                                                    ))
                                                }
                                                className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-line hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div>
                                <Button size="sm" onClick={() => setTranscriptionPicker('extra')}>
                                    Add language
                                </Button>
                            </div>
                        </div>
                    )}

                    {transcriptionMode !== 'off' && (
                        <div className="flex flex-col gap-3 border-t border-line pt-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="flex min-w-0 flex-col">
                                    <span className="text-xs font-semibold text-gray-800">
                                        Phonetic spelling language
                                    </span>
                                    <span className="text-[11px] leading-snug text-gray-500">
                                        English by default; choose any language you read comfortably.
                                    </span>
                                </span>
                                <Button
                                    size="sm"
                                    onClick={() => setTranscriptionPicker('guide')}
                                >
                                    {selectedTranscriptionLanguage?.flag}{' '}
                                    {selectedTranscriptionLanguage?.englishName || 'English'}
                                </Button>
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                                <span className="flex min-w-0 flex-col">
                                    <span className="text-xs font-semibold text-gray-800">
                                        Pronunciation under examples
                                    </span>
                                    <span className="text-[11px] leading-snug text-gray-500">
                                        Adds one readable pronunciation line under each source
                                        example. IPA stays on the headword only.
                                    </span>
                                </span>
                                <Switch
                                    checked={exampleTranscriptionsEnabled}
                                    onChange={(enabled) =>
                                        dispatch(setExampleTranscriptionsEnabled(enabled))
                                    }
                                    label="Pronunciation under examples"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <LanguagePicker
                    open={transcriptionPicker !== null}
                    onClose={() => setTranscriptionPicker(null)}
                    title={
                        transcriptionPicker === 'extra'
                            ? 'Add source language'
                            : 'Phonetic spelling language'
                    }
                    selectedCode={
                        transcriptionPicker === 'guide'
                            ? transcriptionLanguage
                            : null
                    }
                    onSelect={(code) => {
                        if (!code) return;
                        if (transcriptionPicker === 'extra') {
                            dispatch(setTranscriptionExtraLanguages(
                                Array.from(new Set([...transcriptionExtraLanguages, code]))
                            ));
                        } else {
                            dispatch(setTranscriptionLanguage(code));
                        }
                    }}
                />
            </SettingsRow>
        </>
    );
};

export default CardGenerationRows;
