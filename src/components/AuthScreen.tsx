import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  setAuthSession,
  clearAuthSession,
  setAuthLoading,
} from '../store/actions/auth';
import { authApi } from '../services/authApi';
import { authService } from '../services/authService';
import { authStorage } from '../services/authStorage';
import { googleOAuth } from '../services/googleOAuth';
import brandLogo from '../assets/img/vaulto-cards-logo.png';
import { FaCheckCircle, FaClock, FaLayerGroup } from 'react-icons/fa';

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

type DashboardTone = 'neutral' | 'success' | 'warning';

const getToneStyles = (tone: DashboardTone): React.CSSProperties => {
  if (tone === 'success') {
    return {
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      border: '1px solid rgba(16, 185, 129, 0.22)',
      color: '#047857',
    };
  }

  if (tone === 'warning') {
    return {
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      border: '1px solid rgba(245, 158, 11, 0.2)',
      color: '#B45309',
    };
  }

  return {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    color: '#475569',
  };
};

const StatusChip: React.FC<{ label: string; tone?: DashboardTone }> = ({
  label,
  tone = 'neutral',
}) => (
  <div
    style={{
      ...getToneStyles(tone),
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      padding: '7px 10px',
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </div>
);

const MetricTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div
    style={{
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 14,
      padding: 14,
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          backgroundColor: `${accent}14`,
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: colors.textSecondary,
          textAlign: 'right',
        }}
      >
        {label}
      </div>
    </div>
    <div
      style={{
        fontSize: 24,
        lineHeight: 1.05,
        fontWeight: 700,
        letterSpacing: '-0.03em',
        color: colors.text,
        marginTop: 12,
      }}
    >
      {value}
    </div>
  </div>
);

const AuthScreen: React.FC<AuthScreenProps> = ({ onBackClick }) => {
  const dispatch = useDispatch();
  const auth = useSelector((state: RootState) => state.auth);
  const storedCards = useSelector(
    (state: RootState) => state.cards.storedCards
  );
  const authApiUrl = useSelector(
    (state: RootState) => state.settings.authApiUrl
  );
  const autoSaveToServer = useSelector(
    (state: RootState) => state.settings.autoSaveToServer
  );
  const brandLogoUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL(brandLogo)
      : brandLogo;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationPassword, setVerificationPassword] = useState('');
  const [verificationState, setVerificationState] = useState<
    'idle' | 'waiting' | 'verified'
  >('idle');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoLoginTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const isBusy = auth.isLoading || googleLoading;
  const isSignedIn = Boolean(auth.accessToken);

  const subtitle = useMemo(() => {
    if (isSignedIn) {
      return 'Your account, sync status, and workspace health in one place.';
    }
    if (verificationState === 'waiting') {
      return 'We sent a secure verification link to your email and will keep watching for confirmation.';
    }
    if (verificationState === 'verified') {
      return 'Your Vaulto Cards account is ready. Completing sign-in now.';
    }
    return mode === 'signin'
      ? 'Sign in to continue'
      : 'Create an account to sync your cards';
  }, [isSignedIn, mode, verificationState]);

  const heading = useMemo(() => {
    if (isSignedIn) {
      return 'Account Overview';
    }
    if (verificationState === 'waiting') {
      return 'Check your inbox';
    }
    if (verificationState === 'verified') {
      return 'Email Verified!';
    }
    return mode === 'signin' ? 'Welcome Back' : 'Create Account';
  }, [isSignedIn, mode, verificationState]);

  const accountOverview = useMemo(() => {
    const totalCards = storedCards.length;
    const cloudLinkedCards = storedCards.filter((card) => Boolean(card.deckId));
    const syncedCards = cloudLinkedCards.filter(
      (card) =>
        Boolean(card.syncId) &&
        typeof card.syncVersion === 'number' &&
        !card.syncPending
    );
    const pendingCards = cloudLinkedCards.filter(
      (card) =>
        card.syncPending || !card.syncId || typeof card.syncVersion !== 'number'
    );

    return {
      totalCards,
      syncedCardsCount: syncedCards.length,
      pendingCardsCount: pendingCards.length,
    };
  }, [storedCards]);

  const cloudStatusLabel = autoSaveToServer
    ? 'Cloud sync on'
    : 'Cloud sync off';
  const cloudStatusTone: DashboardTone = autoSaveToServer
    ? 'success'
    : 'neutral';

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
        const profile = await authApi.checkVerificationStatus(
          authApiUrl,
          verificationEmail
        );
        if (profile.is_verified) {
          stopPolling();
          setVerificationState('verified');
          clearAutoLoginTimeout();
          autoLoginTimeoutRef.current = setTimeout(async () => {
            dispatch(setAuthLoading(true));
            try {
              const session = await authService.completeLogin(
                authApiUrl,
                verificationEmail,
                verificationPassword
              );
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
  }, [
    authApiUrl,
    dispatch,
    verificationEmail,
    verificationPassword,
    verificationState,
  ]);

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
      const session = await authService.completeLogin(
        authApiUrl,
        email.trim(),
        password.trim()
      );
      await authStorage.setSession(session);
      dispatch(setAuthSession(session));
    } catch (err: any) {
      const message = err?.message || 'Sign in failed.';
      if (message === 'Account is not verified') {
        setError(
          'Your account is not verified yet. Open the verification email, then sign in again.'
        );
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
    <div
      style={{
        minHeight: '100%',
        background: 'linear-gradient(180deg, #F6F8FB 0%, #EEF2F7 100%)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: isSignedIn ? '18px 16px 80px' : '24px 16px 80px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: isSignedIn ? 420 : 372,
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 16,
          padding: isSignedIn ? '18px' : '22px',
          boxShadow: isSignedIn
            ? '0 18px 40px rgba(15, 23, 42, 0.08)'
            : '0 12px 24px rgba(0,0,0,0.08)',
          boxSizing: 'border-box',
        }}
      >
        {auth.accessToken ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                padding: 16,
                borderRadius: 16,
                background: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',
                border: '1px solid rgba(226, 232, 240, 0.95)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <img
                    src={brandLogoUrl}
                    alt="Vaulto Cards logo"
                    style={{
                      width: 36,
                      height: 36,
                      objectFit: 'contain',
                      borderRadius: 10,
                      backgroundColor: '#FFFFFF',
                      padding: 5,
                      boxSizing: 'border-box',
                      border: '1px solid rgba(226, 232, 240, 0.95)',
                    }}
                  />
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: '#64748B',
                    }}
                  >
                    Vaulto account
                  </div>
                </div>
                <StatusChip label={cloudStatusLabel} tone={cloudStatusTone} />
              </div>
              <div
                style={{
                  marginTop: 14,
                  padding: '12px 14px',
                  borderRadius: 12,
                  backgroundColor: '#FFFFFF',
                  border: '1px solid rgba(226, 232, 240, 0.95)',
                  fontSize: 15,
                  lineHeight: 1.2,
                  fontWeight: 600,
                  color: colors.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={auth.user?.email || 'Unknown user'}
              >
                {auth.user?.email || 'Unknown user'}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <MetricTile
                icon={<FaLayerGroup size={15} />}
                label="Cards"
                value={accountOverview.totalCards}
                accent="#0F172A"
              />
              <MetricTile
                icon={<FaCheckCircle size={15} />}
                label="Synced"
                value={accountOverview.syncedCardsCount}
                accent="#10B981"
              />
              <MetricTile
                icon={<FaClock size={15} />}
                label="Pending"
                value={accountOverview.pendingCardsCount}
                accent="#F59E0B"
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onBackClick}
                style={{
                  ...buttonBase,
                  backgroundColor: colors.primary,
                  color: '#fff',
                  flex: 1,
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = colors.primaryHover)
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = colors.primary)
                }
              >
                Back to Cards
              </button>
              <button
                onClick={() => setShowSignOutConfirm(true)}
                disabled={isBusy}
                style={{
                  ...buttonBase,
                  backgroundColor: '#FFFFFF',
                  color: colors.danger,
                  border: `1px solid rgba(220, 53, 69, 0.18)`,
                  width: '42%',
                  opacity: isBusy ? 0.7 : 1,
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <img
                  src={brandLogoUrl}
                  alt="Vaulto Cards logo"
                  style={{
                    width: 38,
                    height: 38,
                    objectFit: 'contain',
                  }}
                />
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: colors.textSecondary,
                  }}
                >
                  Vaulto Cards
                </div>
              </div>
              <div
                style={{
                  fontSize: 30,
                  lineHeight: 1.15,
                  fontWeight: 700,
                  letterSpacing: '-0.03em',
                  color: colors.text,
                }}
              >
                {heading}
              </div>
              <div
                style={{
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: colors.textSecondary,
                  marginTop: 8,
                }}
              >
                {subtitle}
              </div>
            </div>

            {verificationState !== 'idle' ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 28,
                    backgroundColor: colors.backgroundSecondary,
                    border: `1px solid ${
                      verificationState === 'verified'
                        ? colors.success
                        : colors.border
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 38,
                    marginBottom: 18,
                    color:
                      verificationState === 'verified'
                        ? colors.success
                        : colors.primary,
                  }}
                >
                  {verificationState === 'verified' ? '✓' : '@'}
                </div>

                <div
                  style={{
                    fontSize: 14,
                    color: colors.textSecondary,
                    lineHeight: 1.6,
                    marginBottom: 18,
                  }}
                >
                  {verificationState === 'verified' ? (
                    'Your account has been successfully verified. Logging you in now...'
                  ) : (
                    <>
                      We sent a verification link to
                      <br />
                      <strong style={{ color: colors.text }}>
                        {verificationEmail}
                      </strong>
                    </>
                  )}
                </div>

                <div
                  style={{
                    width: '100%',
                    backgroundColor: colors.backgroundSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: 12,
                    padding: '12px 14px',
                    fontSize: 13,
                    color: colors.textSecondary,
                    marginBottom: 14,
                  }}
                >
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
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.4,
                        fontWeight: 600,
                        color: colors.text,
                        marginBottom: 8,
                      }}
                    >
                      Email
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.4,
                        fontWeight: 600,
                        color: colors.text,
                        marginBottom: 8,
                      }}
                    >
                      Password
                    </div>
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
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: colors.text,
                          marginBottom: 6,
                        }}
                      >
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
                    onMouseOver={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        colors.primaryHover)
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.backgroundColor = colors.primary)
                    }
                  >
                    {isBusy
                      ? 'Please wait...'
                      : mode === 'signin'
                      ? 'Sign In'
                      : 'Sign Up'}
                  </button>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      margin: '6px 0',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: colors.border,
                      }}
                    />
                    <span style={{ fontSize: 13, color: colors.textTertiary }}>
                      or continue with
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: colors.border,
                      }}
                    />
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
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      color: colors.danger,
                      textAlign: 'center',
                      lineHeight: 1.5,
                    }}
                  >
                    {error}
                  </div>
                )}

                {notice && (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 13,
                      color: colors.textSecondary,
                      textAlign: 'center',
                      lineHeight: 1.5,
                    }}
                  >
                    {notice}
                  </div>
                )}

                <div
                  style={{
                    marginTop: 14,
                    textAlign: 'center',
                    fontSize: 12,
                    color: colors.textSecondary,
                  }}
                >
                  {mode === 'signin' ? (
                    <button
                      onClick={() => {
                        resetVerificationState();
                        setMode('signup');
                        setError('');
                        setNotice('');
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: colors.primary,
                        cursor: 'pointer',
                      }}
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
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: colors.primary,
                        cursor: 'pointer',
                      }}
                    >
                      Already have an account? Sign In
                    </button>
                  )}
                </div>
              </>
            )}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: 'rgba(220, 53, 69, 0.12)',
                  color: colors.danger,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                }}
              >
                !
              </div>
              <div
                style={{ fontSize: 16, fontWeight: 700, color: colors.text }}
              >
                Confirm Sign Out
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                color: colors.textSecondary,
                lineHeight: 1.5,
                marginBottom: 16,
              }}
            >
              You will be signed out of your account on this device. Your saved
              cards stay intact.
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
