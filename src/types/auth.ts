export interface AuthTokens {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number;
}

export interface LoginResult {
  needs_legal_acceptance: boolean;
  legal_token?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  token_type?: string;
  expires_in?: number | null;
}

export interface AuthUser {
  id: string;
  email: string | null;
  full_name?: string | null;
  is_verified: boolean;
  status: string;
  provider: string;
  plan: string;
  is_pro: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  tokenType: string;
  user: AuthUser | null;
}
