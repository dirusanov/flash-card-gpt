export const SET_SELECTED_LANGUAGE = 'SET_SELECTED_LANGUAGE';

export const setSelectedLanguage = (selectedLanguage: string) => ({
    type: SET_SELECTED_LANGUAGE,
    payload: selectedLanguage,
});
