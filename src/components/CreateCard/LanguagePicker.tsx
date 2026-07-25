import React, { useMemo, useState } from 'react';
import { FaCheck, FaMagic, FaSearch, FaTimes } from 'react-icons/fa';
import Modal from '../ui/Modal';
import { LanguageOption, filterLanguages } from '../../data/languages';

interface LanguagePickerProps {
    open: boolean;
    onClose: () => void;
    title: string;
    /** Currently selected code, or null when auto-detect is active. */
    selectedCode: string | null;
    /** Passing null selects auto-detect. Only offered when `allowAutoDetect` is set. */
    onSelect: (code: string | null) => void;
    allowAutoDetect?: boolean;
    /** Shown next to the auto-detect row once a language has been detected. */
    detectedLanguage?: LanguageOption | null;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({
    open,
    onClose,
    title,
    selectedCode,
    onSelect,
    allowAutoDetect = false,
    detectedLanguage = null,
}) => {
    const [search, setSearch] = useState('');
    const languages = useMemo(() => filterLanguages(search), [search]);

    const choose = (code: string | null) => {
        onSelect(code);
        setSearch('');
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} title={title}>
            <div className="sticky top-0 z-10 border-b border-line bg-white px-4 py-3">
                <div className="relative">
                    <FaSearch
                        size={13}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search languages…"
                        className="h-9 w-full rounded-control border border-line bg-surface-muted pl-9 pr-9 text-sm text-gray-800 transition-colors placeholder:text-gray-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            aria-label="Clear search"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full bg-line p-1 text-gray-500 transition-colors hover:bg-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <FaTimes size={9} />
                        </button>
                    )}
                </div>
            </div>

            <div className="py-1">
                {allowAutoDetect && !search && (
                    <button
                        type="button"
                        onClick={() => choose(null)}
                        className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:bg-surface-sunken ${
                            selectedCode === null ? 'bg-accent-subtle' : ''
                        }`}
                    >
                        <span className="flex w-7 justify-center">
                            <FaMagic size={16} className="text-accent" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span
                                className={`text-sm ${
                                    selectedCode === null
                                        ? 'font-semibold text-accent'
                                        : 'text-gray-900'
                                }`}
                            >
                                Detect automatically
                            </span>
                            <span className="truncate text-xs text-gray-500">
                                {detectedLanguage
                                    ? `Currently detected: ${detectedLanguage.englishName}`
                                    : 'Recognised from the text you paste'}
                            </span>
                        </span>
                        {selectedCode === null && (
                            <FaCheck size={13} className="shrink-0 text-accent" />
                        )}
                    </button>
                )}

                {languages.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-500">
                        Nothing matches “{search}”
                    </p>
                ) : (
                    languages.map((language) => {
                        const selected = language.code === selectedCode;
                        return (
                            <button
                                key={language.code}
                                type="button"
                                onClick={() => choose(language.code)}
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:bg-surface-sunken ${
                                    selected ? 'bg-accent-subtle' : ''
                                }`}
                            >
                                <span className="w-7 text-center text-xl">{language.flag}</span>
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span
                                        className={`truncate text-sm ${
                                            selected
                                                ? 'font-semibold text-accent'
                                                : 'text-gray-900'
                                        }`}
                                    >
                                        {language.name}
                                    </span>
                                    {language.englishName !== language.name && (
                                        <span className="truncate text-xs text-gray-500">
                                            {language.englishName}
                                        </span>
                                    )}
                                </span>
                                {selected && <FaCheck size={13} className="shrink-0 text-accent" />}
                            </button>
                        );
                    })
                )}
            </div>
        </Modal>
    );
};

export default LanguagePicker;
