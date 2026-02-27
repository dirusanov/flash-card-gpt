import { authApi } from './authApi';
import { authService } from './authService';
import { AuthSession } from '../types/auth';

const getChromeIdentity = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.identity) {
      return chrome.identity;
    }
  } catch {
    return null;
  }
  return null;
};

const launchAuthFlow = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const identity = getChromeIdentity();
    if (identity?.launchWebAuthFlow) {
      identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) {
          reject(new Error('Google sign-in was cancelled.'));
          return;
        }
        resolve(responseUrl);
      });
      return;
    }

    try {
      chrome.runtime.sendMessage({ action: 'googleAuthFlow', url }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        if (!response?.ok || !response?.url) {
          reject(new Error(response?.error || 'Google sign-in failed.'));
          return;
        }
        resolve(response.url as string);
      });
    } catch (error: any) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
};

const parseRedirectUri = (authUrl: string): string | null => {
  try {
    const url = new URL(authUrl);
    return url.searchParams.get('redirect_uri');
  } catch {
    return null;
  }
};

export const googleOAuth = {
  async signInWithGoogle(baseUrl: string): Promise<AuthSession> {
    const init = await authApi.initGoogleLogin(baseUrl, 'web');
    const identity = getChromeIdentity();
    const expectedRedirect = identity?.getRedirectURL ? identity.getRedirectURL('oauth2') : null;
    const redirectFromAuth = parseRedirectUri(init.authorization_url);

    if (redirectFromAuth && expectedRedirect && redirectFromAuth !== expectedRedirect) {
      throw new Error(
        `Google OAuth redirect mismatch. Configure AUTH_SERVICE GOOGLE_REDIRECT_URI_WEB to ${expectedRedirect}.`
      );
    }

    const callbackUrl = await launchAuthFlow(init.authorization_url);

    const url = new URL(callbackUrl);
    const error = url.searchParams.get('error');
    if (error) {
      const description = url.searchParams.get('error_description') || error;
      throw new Error(description);
    }

    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) {
      throw new Error('Missing OAuth response parameters.');
    }

    const loginResult = await authApi.completeGoogleLogin(baseUrl, {
      code,
      state,
      code_verifier: init.code_verifier,
      platform: 'web',
    });

    return authService.completeExternalLogin(baseUrl, loginResult);
  },
};
