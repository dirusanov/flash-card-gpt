import { AuthSession } from '../../types/auth';

export const SET_AUTH_SESSION = 'SET_AUTH_SESSION';
export const CLEAR_AUTH_SESSION = 'CLEAR_AUTH_SESSION';
export const SET_AUTH_LOADING = 'SET_AUTH_LOADING';

export const setAuthSession = (session: AuthSession) => ({
  type: SET_AUTH_SESSION,
  payload: session,
});

export const clearAuthSession = () => ({
  type: CLEAR_AUTH_SESSION,
});

export const setAuthLoading = (loading: boolean) => ({
  type: SET_AUTH_LOADING,
  payload: loading,
});
