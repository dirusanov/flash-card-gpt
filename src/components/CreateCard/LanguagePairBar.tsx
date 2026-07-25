import React, { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import LanguagePicker from './LanguagePicker';
import Loader from '../Loader';
import { LanguageOption, findLanguage } from '../../data/languages';

interface LanguagePairBarProps {
    /** Explicit source language, or null while auto-detect is on. */
    sourceCode: string | null;
    /** What auto-detect resolved to, if anything. */
    detectedCode: string | null;
    isDetecting: boolean;
    onSourceChange: (code: string | null) => void;

    targetCode: string;
    onTargetChange: (code: string) => void;
}

const Row: React.FC<{
    caption: string;
    onClick: () => void;
    ariaLabel: string;
    children: React.ReactNode;
}> = ({ caption, onClick, ariaLabel, children }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors first:rounded-t-card last:rounded-b-card hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
        <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {caption}
        </span>
        {children}
        <FaChevronDown size={9} className="shrink-0 text-gray-400" />
    </button>
);

// Replaces four stacked blocks — "Your Language", "Source Language", the Auto toggle and
// the "Translating from X to Y" strip. Two rows rather than two halves of one row: side by
// side, each language got about 110px and names like "Bahasa Indonesia" were cut off.
// Auto-detect is a value of the top row now, not a switch that greys out its neighbour.
const LanguagePairBar: React.FC<LanguagePairBarProps> = ({
    sourceCode,
    detectedCode,
    isDetecting,
    onSourceChange,
    targetCode,
    onTargetChange,
}) => {
    const [picker, setPicker] = useState<'source' | 'target' | null>(null);

    const isAuto = sourceCode === null;
    const detected = findLanguage(detectedCode);
    const source: LanguageOption | null = isAuto ? detected : findLanguage(sourceCode);
    const target = findLanguage(targetCode) || findLanguage('en');

    const renderSourceValue = () => {
        if (isDetecting) {
            return (
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    <Loader type="spinner" size="small" inline color="#9CA3AF" />
                    <span className="truncate text-sm text-gray-500">Detecting…</span>
                </span>
            );
        }
        if (source) {
            return (
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="shrink-0 text-base leading-none">{source.flag}</span>
                    <span className="truncate text-sm font-medium text-gray-900">
                        {source.name}
                    </span>
                    {isAuto && (
                        <span className="shrink-0 text-[11px] text-gray-400">auto</span>
                    )}
                </span>
            );
        }
        return (
            <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-base leading-none">🌐</span>
                <span className="truncate text-sm text-gray-500">
                    {isAuto ? 'Detect automatically' : 'Pick a language'}
                </span>
            </span>
        );
    };

    return (
        <>
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-control">
                <Row
                    caption="From"
                    onClick={() => setPicker('source')}
                    ariaLabel={`Language of your text: ${source ? source.englishName : 'auto-detect'}`}
                >
                    {renderSourceValue()}
                </Row>

                <Row
                    caption="To"
                    onClick={() => setPicker('target')}
                    ariaLabel={`Translate into ${target?.englishName || 'English'}`}
                >
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="shrink-0 text-base leading-none">{target?.flag}</span>
                        <span className="truncate text-sm font-medium text-gray-900">
                            {target?.name}
                        </span>
                    </span>
                </Row>
            </div>

            <LanguagePicker
                open={picker === 'source'}
                onClose={() => setPicker(null)}
                title="Language of your text"
                selectedCode={sourceCode}
                onSelect={onSourceChange}
                allowAutoDetect
                detectedLanguage={detected}
            />

            <LanguagePicker
                open={picker === 'target'}
                onClose={() => setPicker(null)}
                title="Translate into"
                selectedCode={targetCode}
                onSelect={(code) => code && onTargetChange(code)}
            />
        </>
    );
};

export default LanguagePairBar;
