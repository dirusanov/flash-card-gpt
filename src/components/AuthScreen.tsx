import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { setAuthSession, clearAuthSession, setAuthLoading } from '../store/actions/auth';
import { authApi } from '../services/authApi';
import { authService } from '../services/authService';
import { authStorage } from '../services/authStorage';
import { googleOAuth } from '../services/googleOAuth';

interface AuthScreenProps {
  onBackClick: () => void;
}

const colors = {
  background: '#F8F9FA',
  backgroundSecondary: '#E9ECEF',
  surface: '#FFFFFF',
  text: '#1A1A1A',
  textSecondary: '#6C757D',
  textTertiary: '#ADB5BD',
  border: '#DEE2E6',
  primary: '#0066FF',
  primaryHover: '#0052CC',
  danger: '#DC3545',
  success: '#10B981',
};

const buttonBase: React.CSSProperties = {
  borderRadius: 12,
  padding: '12px 14px',
  fontWeight: 600,
  fontSize: 14,
  border: 'none',
  cursor: 'pointer',
  width: '100%',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  backgroundColor: colors.surface,
  color: colors.text,
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};

const AuthScreen: React.FC<AuthScreenProps> = ({ onBackClick }) => {
  const dispatch = useDispatch();
  const auth = useSelector((state: RootState) => state.auth);
  const authApiUrl = useSelector((state: RootState) => state.settings.authApiUrl);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationPassword, setVerificationPassword] = useState('');
  const [verificationState, setVerificationState] = useState<'idle' | 'waiting' | 'verified'>('idle');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoLoginTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isBusy = auth.isLoading || googleLoading;

  const subtitle = useMemo(() => {
    if (verificationState === 'waiting') {
      return 'We sent a secure verification link to your email and will keep watching for confirmation.';
    }
    if (verificationState === 'verified') {
      return 'Your Vaulto Cards account is ready. Completing sign-in now.';
    }
    return mode === 'signin' ? 'Sign in to continue' : 'Create an account to sync your cards';
  }, [mode, verificationState]);

  const heading = useMemo(() => {
    if (verificationState === 'waiting') {
      return 'Check your inbox';
    }
    if (verificationState === 'verified') {
      return 'Email Verified!';
    }
    return mode === 'signin' ? 'Welcome Back' : 'Create Account';
  }, [mode, verificationState]);

  useEffect(() => {
    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const clearAutoLoginTimeout = () => {
      if (autoLoginTimeoutRef.current) {
        clearTimeout(autoLoginTimeoutRef.current);
        autoLoginTimeoutRef.current = null;
      }
    };

    if (verificationState !== 'waiting' || !verificationEmail) {
      stopPolling();
      clearAutoLoginTimeout();
      return () => {
        stopPolling();
        clearAutoLoginTimeout();
      };
    }

    const checkStatus = async () => {
      try {
        const profile = await authApi.checkVerificationStatus(authApiUrl, verificationEmail);
        if (profile.is_verified) {
          stopPolling();
          setVerificationState('verified');
          clearAutoLoginTimeout();
          autoLoginTimeoutRef.current = setTimeout(async () => {
            dispatch(setAuthLoading(true));
            try {
              const session = await authService.completeLogin(authApiUrl, verificationEmail, verificationPassword);
              await authStorage.setSession(session);
              dispatch(setAuthSession(session));
            } catch (err: any) {
              setVerificationState('idle');
              setMode('signin');
              setError(err?.message || 'Sign in failed.');
            } finally {
              dispatch(setAuthLoading(false));
            }
          }, 1200);
        }
      } catch {
        // Ignore transient polling failures; user can still verify from email and retry.
      }
    };

    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, 3000);

    return () => {
      stopPolling();
      clearAutoLoginTimeout();
    };
  }, [authApiUrl, dispatch, verificationEmail, verificationPassword, verificationState]);

  const resetVerificationState = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (autoLoginTimeoutRef.current) {
      clearTimeout(autoLoginTimeoutRef.current);
      autoLoginTimeoutRef.current = null;
    }
    setVerificationState('idle');
    setVerificationEmail('');
    setVerificationPassword('');
  };

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setNotice('');
    resetVerificationState();
    dispatch(setAuthLoading(true));
    try {
      const session = await authService.completeLogin(authApiUrl, email.trim(), password.trim());
      await authStorage.setSession(session);
      dispatch(setAuthSession(session));
    } catch (err: any) {
      const message = err?.message || 'Sign in failed.';
      if (message === 'Account is not verified') {
        setError('Your account is not verified yet. Open the verification email, then sign in again.');
      } else {
        setError(message);
      }
    } finally {
      dispatch(setAuthLoading(false));
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setNotice('');
    dispatch(setAuthLoading(true));
    try {
      const normalizedEmail = email.trim();
      const normalizedPassword = password.trim();
      await authApi.register(authApiUrl, normalizedEmail, normalizedPassword);
      setVerificationEmail(normalizedEmail);
      setVerificationPassword(normalizedPassword);
      setVerificationState('waiting');
      setMode('signin');
    } catch (err: any) {
      setError(err?.message || 'Sign up failed.');
    } finally {
      dispatch(setAuthLoading(false));
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const session = await googleOAuth.signInWithGoogle(authApiUrl);
      await authStorage.setSession(session);
      dispatch(setAuthSession(session));
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignOut = async () => {
    dispatch(setAuthLoading(true));
    try {
      await authStorage.clearSession();
      dispatch(clearAuthSession());
    } finally {
      dispatch(setAuthLoading(false));
    }
  };

  return (
    <div style={{
      minHeight: '100%',
      backgroundColor: colors.background,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px 80px',
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 372,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: '22px',
        boxShadow: '0 12px 24px rgba(0,0,0,0.08)',
        boxSizing: 'border-box',
      }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              backgroundColor: colors.primary,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 700,
              boxShadow: '0 8px 18px rgba(0, 102, 255, 0.18)',
            }}>
              V
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>Vaulto Cards</div>
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.03em', color: colors.text }}>
            {heading}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.5, color: colors.textSecondary, marginTop: 8 }}>{subtitle}</div>
        </div>

        {auth.accessToken ? (
          <>
            <div style={{
              fontSize: 13,
              color: colors.text,
              marginBottom: 16,
              textAlign: 'center',
            }}>
              Signed in as <strong>{auth.user?.email || 'Unknown user'}</strong>
            </div>
            <button
              onClick={() => setShowSignOutConfirm(true)}
              disabled={isBusy}
              style={{
                ...buttonBase,
                backgroundColor: colors.danger,
                color: '#fff',
                opacity: isBusy ? 0.7 : 1,
              }}
            >
              Sign Out
            </button>
            <button
              onClick={onBackClick}
              style={{
                ...buttonBase,
                backgroundColor: '#EDF2F7',
                color: colors.text,
                marginTop: 10,
              }}
            >
              Back to Cards
            </button>
          </>
        ) : verificationState !== 'idle' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{
              width: 88,
              height: 88,
              borderRadius: 28,
              backgroundColor: colors.backgroundSecondary,
              border: `1px solid ${verificationState === 'verified' ? colors.success : colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 38,
              marginBottom: 18,
              color: verificationState === 'verified' ? colors.success : colors.primary,
            }}>
              {verificationState === 'verified' ? '✓' : '@'}
            </div>

            <div style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 1.6, marginBottom: 18 }}>
              {verificationState === 'verified' ? (
                'Your account has been successfully verified. Logging you in now...'
              ) : (
                <>
                  We sent a verification link to
                  <br />
                  <strong style={{ color: colors.text }}>{verificationEmail}</strong>
                </>
              )}
            </div>

            <div style={{
              width: '100%',
              backgroundColor: colors.backgroundSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13,
              color: colors.textSecondary,
              marginBottom: 14,
            }}>
              {verificationState === 'verified'
                ? 'Verification complete. Please wait a moment.'
                : 'Waiting for verification. Open the link from the email and this screen will update automatically.'}
            </div>

            <button
              type="button"
              onClick={() => {
                resetVerificationState();
                setMode('signin');
                setNotice('');
                setError('');
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: colors.primary,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                padding: 0,
              }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, lineHeight: 1.4, fontWeight: 600, color: colors.text, marginBottom: 8 }}>Email</div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  style={inputStyle}
                />
              </div>

              <div>
                <div style={{ fontSize: 13, lineHeight: 1.4, fontWeight: 600, color: colors.text, marginBottom: 8 }}>Password</div>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    style={{ ...inputStyle, paddingRight: 70 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: colors.textSecondary,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: colors.text, marginBottom: 6 }}>
                    Confirm Password
                  </div>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    style={inputStyle}
                  />
                </div>
              )}

              <button
                onClick={mode === 'signin' ? handleSignIn : handleSignUp}
                disabled={isBusy}
                style={{
                  ...buttonBase,
                  backgroundColor: colors.primary,
                  color: '#fff',
                  fontSize: 16,
                  opacity: isBusy ? 0.7 : 1,
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = colors.primaryHover)}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = colors.primary)}
              >
                {isBusy ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
                <div style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <span style={{ fontSize: 13, color: colors.textTertiary }}>or continue with</span>
                <div style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={isBusy}
                style={{
                  ...buttonBase,
                  backgroundColor: '#FFFFFF',
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  fontSize: 16,
                }}
              >
                Continue with Google
              </button>
            </div>

            {error && (
              <div style={{
                marginTop: 12,
                fontSize: 13,
                color: colors.danger,
                textAlign: 'center',
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            {notice && (
              <div style={{
                marginTop: 12,
                fontSize: 13,
                color: colors.textSecondary,
                textAlign: 'center',
                lineHeight: 1.5,
              }}>
                {notice}
              </div>
            )}

            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: colors.textSecondary }}>
              {mode === 'signin' ? (
                <button
                  onClick={() => {
                    resetVerificationState();
                    setMode('signup');
                    setError('');
                    setNotice('');
                  }}
                  style={{ background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer' }}
                >
                  Don&apos;t have an account? Sign Up
                </button>
              ) : (
                <button
                  onClick={() => {
                    resetVerificationState();
                    setMode('signin');
                    setError('');
                    setNotice('');
                  }}
                  style={{ background: 'transparent', border: 'none', color: colors.primary, cursor: 'pointer' }}
                >
                  Already have an account? Sign In
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {showSignOutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: colors.surface,
              borderRadius: 16,
              padding: 18,
              border: `1px solid ${colors.border}`,
              boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: 'rgba(220, 53, 69, 0.12)',
                color: colors.danger,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
              }}>
                !
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>
                Confirm Sign Out
              </div>
            </div>
            <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.5, marginBottom: 16 }}>
              You will be signed out of your account on this device. Your saved cards stay intact.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                style={{
                  ...buttonBase,
                  backgroundColor: '#EDF2F7',
                  color: colors.text,
                  width: '50%',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleSignOut();
                  setShowSignOutConfirm(false);
                }}
                disabled={isBusy}
                style={{
                  ...buttonBase,
                  backgroundColor: colors.danger,
                  color: '#fff',
                  width: '50%',
                  opacity: isBusy ? 0.7 : 1,
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthScreen;
