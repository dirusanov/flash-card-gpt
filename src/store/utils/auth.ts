import { RootState } from "..";
import { authApi } from "../../services/authApi";
import { authStorage } from "../../services/authStorage";
import { setAuthSession, CLEAR_AUTH_SESSION } from "../actions/auth";
import { Dispatch } from "redux";

export const isTokenExpired = (expiresAt: number | null): boolean => {
    if (!expiresAt) return false;
    // Buffer of 60 seconds
    return Date.now() > expiresAt - 60_000;
};

export const ensureValidAccessToken = async (
    store: { getState: () => RootState; dispatch: Dispatch<any> },
    forceRefresh = false
): Promise<string | null> => {
    const state: RootState = store.getState();
    const { accessToken, refreshToken, expiresAt, user } = state.auth;
    const { authApiUrl } = state.settings;

    if (!accessToken) return null;

    if (!forceRefresh && !isTokenExpired(expiresAt)) {
        return accessToken;
    }

    if (!refreshToken) {
        return null;
    }

    try {
        const refreshed = await authApi.refresh(authApiUrl, refreshToken);
        if (!refreshed.access_token) {
            return null;
        }

        const nextSession = {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token ?? null,
            expiresAt: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null,
            tokenType: refreshed.token_type ?? 'bearer',
            user: user ?? null,
        };

        await authStorage.setSession(nextSession);
        store.dispatch(setAuthSession(nextSession));
        return nextSession.accessToken;
    } catch (error) {
        console.error('Token refresh failed:', error);
        await authStorage.clearSession();
        store.dispatch({ type: CLEAR_AUTH_SESSION });
        return null;
    }
};
