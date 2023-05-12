import { SET_SELECTED_LANGUAGE } from '../actions/languageActions';

export interface LanguageState {
    selectedLanguage: string;
}

const initialState: LanguageState = {
    selectedLanguage: 'ru',
};

const languageReducer = (state = initialState, action: any): LanguageState => {
    switch (action.type) {
        case SET_SELECTED_LANGUAGE:
            return {
                ...state,
                selectedLanguage: action.payload,
            };
        default:
            return state;
    }
};

export default languageReducer;
