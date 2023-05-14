import { createStore, applyMiddleware, combineReducers } from 'redux';
import thunk from 'redux-thunk';
import decksReducer from "./reducers/decks";
import cardsReducer from "./reducers/cards";
import { localStorageMiddleware, loadState } from './localStorageMiddleware';
import {settingsReducer} from "./reducers/settings";
import currentPageReducer from "./reducers/page";

const rootReducer = combineReducers({
    deck: decksReducer,
    cards: cardsReducer,
    settings: settingsReducer,
    currentPage: currentPageReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const store = createStore(rootReducer, loadState(), applyMiddleware(thunk, localStorageMiddleware));

export default store;
