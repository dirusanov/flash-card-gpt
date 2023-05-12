import { Middleware, MiddlewareAPI, Dispatch } from 'redux';
import { RootState } from './index';

const saveState = (state: RootState): void => {
    try {
        const serializedState = JSON.stringify(state);
        localStorage.setItem('state', serializedState);
    } catch (err) {
        console.error('Error saving state:', err);
    }
};

const loadState = (): RootState | undefined => {
    try {
        const serializedState = localStorage.getItem('state');
        if (serializedState === null) {
            return undefined;
        }
        return JSON.parse(serializedState);
    } catch (err) {
        console.error('Error loading state:', err);
        return undefined;
    }
};

const localStorageMiddleware: Middleware = ({ getState }: MiddlewareAPI) => (
    next: Dispatch,
) => (action) => {
    const result = next(action);
    saveState(getState() as RootState);
    return result;
};

export { saveState, loadState, localStorageMiddleware };
