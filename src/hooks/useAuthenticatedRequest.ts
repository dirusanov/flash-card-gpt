import { useCallback } from 'react';
import { useDispatch, useStore } from 'react-redux';
import { RootState } from '../store';
import { ensureValidAccessToken } from '../store/utils/auth';

/**
 * A hook that provides a wrapper for making authenticated API requests.
 * It automatically handles token expiration and refresh.
 */
export const useAuthenticatedRequest = () => {
    const dispatch = useDispatch();
    const store = useStore<RootState>();

    const execute = useCallback(async <T>(request: (token: string) => Promise<T>): Promise<T> => {
        // 1. Ensure we have a valid token before the request
        let token = await ensureValidAccessToken({ getState: store.getState, dispatch });
        if (!token) {
            throw new Error('User is not authenticated or session expired');
        }

        try {
            // 2. Execute the request
            return await request(token);
        } catch (error: any) {
            // 3. If request fails with 401, try to refresh once and retry
            if (error?.status === 401) {
                console.warn('API returned 401, attempting token refresh...');
                token = await ensureValidAccessToken({ getState: store.getState, dispatch }, true);
                if (token) {
                    return await request(token);
                }
            }
            // 4. If all fails, propagate the error
            throw error;
        }
    }, [dispatch, store]);

    return execute;
};
