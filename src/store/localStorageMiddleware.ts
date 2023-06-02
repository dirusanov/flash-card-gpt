import { Middleware, MiddlewareAPI, Dispatch } from 'redux';
import { RootState } from './index';

const saveState = async (state: RootState): Promise<void> => {
    try {
    return await new Promise<void>((resolve, reject) => {
      chrome.storage.sync.set({ state: JSON.stringify(state) }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    console.error('Error saving state:', err);
  }
};

const loadState = (): Promise<RootState | undefined> => {
  return new Promise((resolve, reject) => {
      chrome.storage.sync.get('state', (items) => {
        const apiKey = items.state.settings;
        console.log('=======================================================')
        console.log(apiKey)
        if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
        } else {
            const serializedState = items.state;
            if (serializedState === undefined) {
                resolve(undefined);
            } else {
                resolve(JSON.parse(serializedState));
            }
        }
      });
  });
};

const chromeStorageMiddleware: Middleware = ({ getState }: MiddlewareAPI) => (
  next: Dispatch,
) => (action) => {
  const result = next(action);
  saveState(getState() as RootState).catch(err => {
      console.error('Error saving state:', err);
  });
  return result;
};

export { saveState, loadState, chromeStorageMiddleware };
