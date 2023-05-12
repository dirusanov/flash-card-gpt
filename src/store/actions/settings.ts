import {createAction} from "@reduxjs/toolkit";

export const setApiKey = createAction<string>('settings/setApiKey');
