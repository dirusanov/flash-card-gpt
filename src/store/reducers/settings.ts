import { createReducer } from '@reduxjs/toolkit';
import {setApiKey} from "../actions/settings";

interface SettingsState {
    apiKey: string | null;
}

const initialState: SettingsState = {
    apiKey: localStorage.getItem('openai_key'),
};

export const settingsReducer = createReducer(initialState, (builder) => {
    builder.addCase(setApiKey, (state, action) => {
        state.apiKey = action.payload;
        localStorage.setItem('openai_key', action.payload);
    });
});
