import { AuthSession, AuthUser } from '../../types/auth';
import { SET_AUTH_SESSION, CLEAR_AUTH_SESSION, SET_AUTH_LOADING } from '../actions/auth';

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  tokenType: string | null;
  isLoading: boolean;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  tokenType: null,
  isLoading: false,
};

export const authReducer = (state = initialState, action: any): AuthState => {
  switch (action.type) {
    case SET_AUTH_SESSION: {
      const session = action.payload as AuthSession;
      return {
        ...state,
        user: session.user ?? null,
        accessToken: session.accessToken ?? null,
        refreshToken: session.refreshToken ?? null,
        expiresAt: session.expiresAt ?? null,
        tokenType: session.tokenType ?? 'bearer',
        isLoading: false,
      };
    }
    case CLEAR_AUTH_SESSION:
      return { ...initialState };
    case SET_AUTH_LOADING:
      return { ...state, isLoading: !!action.payload };
    default:
      return state;
  }
};
