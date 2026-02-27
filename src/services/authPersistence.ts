import type { Store } from 'redux';
import type { RootState } from '../store';
import { authStorage } from './authStorage';
import { setAuthSession, clearAuthSession } from '../store/actions/auth';
import { AuthSession } from '../types/auth';
import { authApi } from './authApi';

const snapshotSession = (state: RootState): AuthSession | null => {
  const { accessToken, refreshToken, expiresAt, tokenType, user } = state.auth;
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresAt,
    tokenType: tokenType ?? 'bearer',
    user: user ?? null,
  };
};

const sessionsEqual = (a: AuthSession | null, b: AuthSession | null): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.accessToken === b.accessToken &&
    a.refreshToken === b.refreshToken &&
    a.expiresAt === b.expiresAt &&
    a.tokenType === b.tokenType &&
    JSON.stringify(a.user ?? null) === JSON.stringify(b.user ?? null)
  );
};

const isTokenExpired = (expiresAt: number | null): boolean => {
  if (!expiresAt) return false;
  return Date.now() > expiresAt - 60_000;
};

export const initializeAuthPersistence = async (store: Store<RootState>) => {
  let storedSession = await authStorage.getSession();

  if (storedSession?.accessToken && storedSession.refreshToken && isTokenExpired(storedSession.expiresAt)) {
    try {
      const refreshed = await authApi.refresh(storedSession.refreshToken);
      storedSession = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? null,
        expiresAt: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null,
        tokenType: refreshed.token_type ?? 'bearer',
        user: storedSession.user ?? null,
      };
      await authStorage.setSession(storedSession);
    } catch (error) {
      console.error('Failed to refresh stored auth session:', error);
      storedSession = null;
      await authStorage.clearSession();
    }
  }

  if (storedSession?.accessToken) {
    store.dispatch(setAuthSession(storedSession));
  } else {
    store.dispatch(clearAuthSession());
  }

  let lastSnapshot = snapshotSession(store.getState());
  await authStorage.setSession(lastSnapshot);

  let pending: Promise<void> = Promise.resolve();

  const queueSave = (snapshot: AuthSession | null) => {
    pending = pending.then(() => authStorage.setSession(snapshot)).catch((error) => {
      console.error('Failed to persist auth session:', error);
    });
  };

  const unsubscribe = store.subscribe(() => {
    const nextSnapshot = snapshotSession(store.getState());
    if (!sessionsEqual(nextSnapshot, lastSnapshot)) {
      lastSnapshot = nextSnapshot;
      queueSave(nextSnapshot);
    }
  });

  return () => {
    unsubscribe();
  };
};
