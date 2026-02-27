import { setupReduxed } from 'reduxed-chrome-storage';
import { createStore, applyMiddleware, combineReducers } from 'redux';
import thunk from 'redux-thunk';
import decksReducer from "./reducers/decks";
import cardsReducer from "./reducers/cards";
import {settingsReducer} from "./reducers/settings";
import currentPageReducer from "./reducers/page";
import ankiReducer from './reducers/anki';
import sidebarReducer from './reducers/sidebar';
import notificationsReducer from './reducers/notifications';
import tabStateReducer from './reducers/tabState';
import cardsLocalStorageMiddleware from './middleware/cardsLocalStorage';
import { viewReducer } from './reducers/view';
import { authReducer } from './reducers/auth';
import cardsSyncMiddleware from './middleware/cardsSyncMiddleware';

const rootReducer = combineReducers({
    deck: decksReducer,
    cards: cardsReducer,
    settings: settingsReducer,
    currentPage: currentPageReducer,
    anki: ankiReducer,
    sidebar: sidebarReducer,
    notifications: notificationsReducer,
    tabState: tabStateReducer,
    view: viewReducer,
    auth: authReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const storeCreator = (preloadedState?: RootState) => 
  createStore(rootReducer, preloadedState, applyMiddleware(thunk, cardsLocalStorageMiddleware, cardsSyncMiddleware));

const instantiateStoreBase = setupReduxed(storeCreator);

const isExtensionContextInvalidatedError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message || '';
  return message.includes('Extension context invalidated');
};

const wrapStoreDispatchWithContextGuard = (store: any) => {
  if (!store || typeof store.dispatch !== 'function') {
    return store;
  }

  const originalDispatch = store.dispatch.bind(store);
  store.dispatch = (action: any) => {
    try {
      return originalDispatch(action);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        // Happens when content script from old extension context is still alive after reload.
        console.warn('Skipping dispatch: extension context invalidated');
        return action;
      }
      throw error;
    }
  };

  return store;
};

export const instantiateStore = async () => {
  const store = await instantiateStoreBase();
  return wrapStoreDispatchWithContextGuard(store);
};
