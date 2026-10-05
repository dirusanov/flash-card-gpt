import React from 'react';
import { FaChevronDown, FaImage, FaVolumeUp } from 'react-icons/fa';
import Menu, { MenuItem } from '../ui/Menu';
import Tooltip from '../ui/Tooltip';

export type GenerationMode = 'off' | 'smart' | 'always';

interface GenerationChipsProps {
    imageMode: GenerationMode;
    audioMode: GenerationMode;
    onImageModeChange: (mode: GenerationMode) => void;
    onAudioModeChange: (mode: GenerationMode) => void;
    /** Which "on" mode each chip restores — remembered across off/on, not reset to smart. */
    imageOnMode: Exclude<GenerationMode, 'off'>;
    audioOnMode: Exclude<GenerationMode, 'off'>;
    /** Both features go through OpenAI, so this is a single gate. */
    hasOpenAiKey: boolean;
}

const NO_KEY_HINT = 'Needs an OpenAI API key — add one in Settings';

const IMAGE_ITEMS: MenuItem<GenerationMode>[] = [
    { value: 'off', label: 'Off', description: 'Never generate an image' },
    {
        value: 'smart',
        label: 'Smart',
        description: 'Only for words you can picture. Skips abstract terms, which is where the cost adds up.',
    },
    { value: 'always', label: 'Every card', description: 'Generate an image for every card' },
];

const AUDIO_ITEMS: MenuItem<GenerationMode>[] = [
    { value: 'off', label: 'Off', description: 'Never generate pronunciation' },
    {
        value: 'smart',
        label: 'Smart',
        description: 'Only for single words and short phrases, where pronunciation helps',
    },
    { value: 'always', label: 'Every card', description: 'Generate pronunciation for every card' },
];

const MODE_LABEL: Record<GenerationMode, string> = {
    off: '',
    smart: 'Smart',
    always: 'All',
};

interface ModeChipProps {
    name: string;
    icon: React.ReactNode;
    mode: GenerationMode;
    items: MenuItem<GenerationMode>[];
    onChange: (mode: GenerationMode) => void;
    disabled?: boolean;
    /** Restores this mode when the chip is switched back on. */
    lastOnMode: Exclude<GenerationMode, 'off'>;
}

// A split chip: the body flips on/off in one click, the caret opens the full three-way
// choice. The mode is written on the chip, because "is this the cheap one?" has to be
// answerable at a glance — a plain highlighted chip could not answer it.
const ModeChip: React.FC<ModeChipProps> = ({
    name,
    icon,
    mode,
    items,
    onChange,
    disabled,
    lastOnMode,
}) => {
    const active = mode !== 'off';

    return (
        <Menu
            label={`${name} generation mode`}
            items={items}
            value={mode}
            onSelect={onChange}
            trigger={({ open, toggle }) => (
                <span
                    className={[
                        'inline-flex h-8 items-stretch overflow-hidden rounded-full border transition-colors duration-150',
                        disabled ? 'opacity-50' : '',
                        active
                            ? 'border-accent-border bg-accent-subtle'
                            : 'border-line bg-white',
                    ].join(' ')}
                >
                    <Tooltip label={disabled ? NO_KEY_HINT : undefined}>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            aria-label={`${name} generation`}
                            disabled={disabled}
                            onClick={() => onChange(active ? 'off' : lastOnMode)}
                            className={[
                                'inline-flex items-center gap-1.5 pl-3 pr-2 text-[13px] font-medium',
                                'transition-colors duration-150',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                                'disabled:cursor-not-allowed',
                                active
                                    ? 'text-accent'
                                    : 'text-gray-500 hover:bg-surface-sunken',
                            ].join(' ')}
                        >
                            {icon}
                            {name}
                            {active && (
                                <span className="text-[11px] font-normal opacity-70">
                                    · {MODE_LABEL[mode]}
                                </span>
                            )}
                        </button>
                    </Tooltip>

                    <button
                        type="button"
                        aria-label={`Change ${name.toLowerCase()} mode`}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        disabled={disabled}
                        onClick={toggle}
                        className={[
                            'inline-flex items-center border-l pr-2.5 pl-2',
                            'transition-colors duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                            'disabled:cursor-not-allowed',
                            active
                                ? 'border-accent-border text-accent hover:bg-accent-border/40'
                                : 'border-line text-gray-400 hover:bg-surface-sunken',
                        ].join(' ')}
                    >
                        <FaChevronDown size={8} />
                    </button>
                </span>
            )}
        />
    );
};

// Replaces two three-way segmented controls, each of which carried a permanent two-line
// description and its own red/amber "API key required" banner.
const GenerationChips: React.FC<GenerationChipsProps> = ({
    imageMode,
    audioMode,
    onImageModeChange,
    onAudioModeChange,
    imageOnMode,
    audioOnMode,
    hasOpenAiKey,
}) => (
    <div className="flex flex-wrap items-center justify-center gap-2">
        <ModeChip
            name="Image"
            icon={<FaImage size={12} />}
            mode={imageMode}
            items={IMAGE_ITEMS}
            onChange={onImageModeChange}
            disabled={!hasOpenAiKey}
            lastOnMode={imageOnMode}
        />
        <ModeChip
            name="Audio"
            icon={<FaVolumeUp size={12} />}
            mode={audioMode}
            items={AUDIO_ITEMS}
            onChange={onAudioModeChange}
            disabled={!hasOpenAiKey}
            lastOnMode={audioOnMode}
        />
        {hasOpenAiKey && imageMode === 'smart' && (
            <p className="m-0 w-full text-center text-[11px] leading-snug text-gray-500">
                Smart skips abstract words. Choose Image → Every card to request an image each time.
            </p>
        )}
    </div>
);

export default GenerationChips;
