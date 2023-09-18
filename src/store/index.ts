import { setupReduxed } from 'reduxed-chrome-storage';
import { createStore, applyMiddleware, combineReducers } from 'redux';
import thunk from 'redux-thunk';
import decksReducer from "./reducers/decks";
import cardsReducer from "./reducers/cards";
import {settingsReducer} from "./reducers/settings";
import currentPageReducer from "./reducers/page";

const rootReducer = combineReducers({
    deck: decksReducer,
    cards: cardsReducer,
    settings: settingsReducer,
    currentPage: currentPageReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const storeCreator = (preloadedState?: RootState) => 
  createStore(rootReducer, preloadedState, applyMiddleware(thunk));

export const instantiateStore = setupReduxed(storeCreator);
