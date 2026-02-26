import React from 'react';
import { FaTimes } from 'react-icons/fa';

export interface LanguageOption {
    code: string;
    name: string;
    flag: string;
    englishName: string;
}

interface LanguageSelectorProps {
    showModal: boolean;
    setShowModal: (show: boolean) => void;
    currentLanguage: LanguageOption | null;
    filteredLanguages: LanguageOption[] | null | undefined;
    search: string;
    setSearch: (value: string) => void;
    onSelect: (code: string) => void;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({
    showModal,
    setShowModal,
    currentLanguage,
    filteredLanguages,
    search,
    setSearch,
    onSelect,
}) => {
    const safeLanguage: LanguageOption = currentLanguage || {
        code: 'en',
        name: 'English',
        flag: '🌐',
        englishName: 'English',
    };
    const safeLanguages = filteredLanguages || [];

    if (!showModal) {
        return (
            <div className="relative flex w-full flex-col gap-2">
                <label className="m-0 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    Your Language
                    <span className="text-xs font-normal italic text-gray-500">(translations)</span>
                </label>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex w-full items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-100"
                >
                    <span className="flex items-center gap-2">
                        <span className="text-lg">{safeLanguage.flag}</span>
                        <span>{safeLanguage.name}</span>
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
                    </svg>
                </button>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
            <div className="flex max-h-[80vh] w-[90%] max-w-[360px] flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col gap-3 border-b border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                        <h3 className="m-0 text-base font-semibold text-gray-900">Select Your Language</h3>
                        <button onClick={() => setShowModal(false)} className="rounded p-2 text-gray-500 hover:bg-gray-100">
                            <FaTimes size={16} />
                        </button>
                    </div>
                    <div className="relative w-full">
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search languages..."
                            className="w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 pr-9 text-sm text-gray-700 outline-none focus:border-blue-600"
                        />
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#9CA3AF" viewBox="0 0 16 16" className="absolute left-3 top-1/2 -translate-y-1/2">
                            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
                        </svg>
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-gray-200 p-1 text-gray-500 hover:bg-gray-300">
                                <FaTimes size={10} />
                            </button>
                        )}
                    </div>
                    <p className="m-0 text-xs leading-relaxed text-gray-500">This will be used for both the interface language and translations.</p>
                </div>
                <div className="max-h-[calc(80vh-140px)] overflow-y-auto py-2">
                    {safeLanguages.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">No languages found matching "{search}"</div>
                    ) : (
                        safeLanguages.map((language) => (
                            <button
                                key={language.code}
                                onClick={() => {
                                    onSelect(language.code);
                                    setShowModal(false);
                                }}
                                className={`flex w-full items-center px-4 py-3 text-left transition-colors hover:bg-gray-100 ${language.code === safeLanguage.code ? 'bg-blue-50' : ''}`}
                            >
                                <span className="mr-3 w-7 text-center text-[22px]">{language.flag}</span>
                                <span className="flex flex-1 flex-col items-start">
                                    <span className={`text-sm ${language.code === safeLanguage.code ? 'font-semibold text-blue-600' : 'text-gray-900'}`}>{language.name}</span>
                                    {language.englishName !== language.name && <span className="text-xs text-gray-500">{language.englishName}</span>}
                                </span>
                                {language.code === safeLanguage.code && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#2563EB" viewBox="0 0 16 16" className="ml-auto">
                                        <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                                    </svg>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default LanguageSelector;
