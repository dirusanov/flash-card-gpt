import { authApi } from './authApi';
import { AuthSession, AuthTokens, LoginResult } from '../types/auth';

const resolveLoginTokens = async (result: LoginResult): Promise<AuthTokens> => {
  if (result.needs_legal_acceptance) {
    if (!result.legal_token) {
      throw new Error('Missing legal acceptance token');
    }
    return authApi.acceptLegal(result.legal_token);
  }

  if (!result.access_token || !result.refresh_token || !result.expires_in) {
    throw new Error('Invalid login response');
  }

  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    token_type: result.token_type ?? 'bearer',
    expires_in: result.expires_in,
  };
};

export const authService = {
  async completeLogin(email: string, password: string): Promise<AuthSession> {
    const loginResult = await authApi.login(email, password);
    const tokens = await resolveLoginTokens(loginResult);
    const user = await authApi.getProfile(tokens.access_token);
    const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      tokenType: tokens.token_type ?? 'bearer',
      user,
    };
  },

  async completeExternalLogin(result: LoginResult): Promise<AuthSession> {
    const tokens = await resolveLoginTokens(result);
    const user = await authApi.getProfile(tokens.access_token);
    const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      tokenType: tokens.token_type ?? 'bearer',
      user,
    };
  },
};
