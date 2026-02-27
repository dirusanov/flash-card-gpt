import { backgroundFetch } from './backgroundFetch';
import { AuthTokens, AuthUser, LoginResult } from '../types/auth';

const DEFAULT_AUTH_API_URL = 'https://auth.vaultonote.com';
const AUTH_AUDIENCE = 'vaulto_extension_api';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const parseErrorMessage = async (response: { json: <T>() => Promise<T> } & { status: number }): Promise<string> => {
  try {
    const data = (await response.json()) as Record<string, any>;
    return data?.detail?.message ?? data?.detail ?? data?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const requestJson = async <T>(
  baseUrl: string,
  path: string,
  init: { method: string; body?: string; headers?: Record<string, string> },
  accessToken?: string,
): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await backgroundFetch(`${baseUrl || DEFAULT_AUTH_API_URL}${path}`, {
    method: init.method,
    headers,
    body: init.body,
  });

  if (!response.ok) {
    const message = await parseErrorMessage({ json: () => response.json(), status: response.status });
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
};

export const authApi = {
  async register(baseUrl: string, email: string, password: string): Promise<void> {
    await requestJson(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, terms_accepted: true }),
    });
  },

  async login(baseUrl: string, email: string, password: string): Promise<LoginResult> {
    return requestJson<LoginResult>(baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, audience: AUTH_AUDIENCE }),
    });
  },

  async initGoogleLogin(baseUrl: string, platform: 'web' | 'mobile' = 'web'): Promise<{
    authorization_url: string;
    state: string;
    code_verifier: string;
  }> {
    return requestJson(baseUrl, '/auth/google/login?platform=' + platform + '&app=cards', { method: 'GET' });
  },

  async completeGoogleLogin(baseUrl: string, params: {
    code: string;
    state: string;
    code_verifier?: string;
    platform?: 'web' | 'mobile';
  }): Promise<LoginResult> {
    const query = new URLSearchParams({
      code: params.code,
      state: params.state,
      audience: AUTH_AUDIENCE,
      platform: params.platform ?? 'web',
    });
    if (params.code_verifier) {
      query.set('code_verifier', params.code_verifier);
    }
    return requestJson<LoginResult>(baseUrl, `/auth/google/callback?${query.toString()}`, { method: 'GET' });
  },

  async acceptLegal(baseUrl: string, legalToken: string): Promise<AuthTokens> {
    return requestJson<AuthTokens>(baseUrl, '/auth/legal/accept', {
      method: 'POST',
      body: JSON.stringify({ legal_token: legalToken, audience: AUTH_AUDIENCE }),
    });
  },

  async refresh(baseUrl: string, refreshToken: string): Promise<AuthTokens> {
    return requestJson<AuthTokens>(baseUrl, '/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  async getProfile(baseUrl: string, accessToken: string): Promise<AuthUser> {
    return requestJson<AuthUser>(baseUrl, '/auth/me', { method: 'GET' }, accessToken);
  },
};

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;
