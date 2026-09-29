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
import { FaCheckCircle, FaClock, FaLayerGroup, FaEnvelope } from 'react-icons/fa';
import Button from './ui/Button';
import Modal from './ui/Modal';
import Loader from './Loader';

interface AuthScreenProps {
  onBackClick: () => void;
}

type DashboardTone = 'neutral' | 'success' | 'warning';

const TONE_CLASSES: Record<DashboardTone, string> = {
  neutral: 'bg-surface-sunken text-gray-600',
  success: 'bg-ok-subtle text-ok-strong',
  warning: 'bg-warn-subtle text-warn-strong',
};

const StatusChip: React.FC<{ label: string; tone?: DashboardTone }> = ({
  label,
  tone = 'neutral',
}) => (
  <span
    className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONE_CLASSES[tone]}`}
  >
    {label}
  </span>
);

const MetricTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div className="flex min-w-0 flex-col items-center rounded-card border border-line bg-white p-3 text-center shadow-control">
    <span
      className="flex h-8 w-8 items-center justify-center rounded-card"
      style={{ backgroundColor: `${accent}14`, color: accent }}
    >
      {icon}
    </span>
    <span className="mt-2.5 text-[22px] font-bold leading-none tracking-tight text-gray-900">
      {value}
    </span>
    <span
      className="mt-1.5 max-w-full truncate text-[11px] font-semibold text-gray-500"
      title={label}
    >
      {label}
    </span>
  </div>
);

// Shared input styling so the fields match the rest of the panel's controls.
const INPUT_CLASS =
  'w-full rounded-control border border-line bg-white px-3 py-2.5 text-[14px] text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent';
const FIELD_LABEL_CLASS = 'mb-1.5 block text-[13px] font-semibold text-gray-700';

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
      return 'Signed in — your cards sync automatically.';
    }
    if (verificationState === 'waiting') {
      return 'We sent a secure verification link to your email and will keep watching for confirmation.';
    }
    if (verificationState === 'verified') {
      return 'Your Vaulto Cards account is ready. Completing sign-in now.';
    }
    return mode === 'signin'
      ? 'Sign in to back up and sync your cards.'
      : 'Create an account so your cards are never lost.';
  }, [isSignedIn, mode, verificationState]);

  const heading = useMemo(() => {
    if (isSignedIn) {
      return 'Account';
    }
    if (verificationState === 'waiting') {
      return 'Check your inbox';
    }
    if (verificationState === 'verified') {
      return 'Email verified';
    }
    return mode === 'signin' ? 'Welcome back' : 'Create account';
  }, [isSignedIn, mode, verificationState]);

  const accountOverview = useMemo(() => {
    const totalCards = storedCards.length;
    const syncedCards = storedCards.filter(
      (card) =>
        Boolean(card.syncId) &&
        typeof card.syncVersion === 'number' &&
        !card.syncPending
    );

    return {
      totalCards,
      syncedCardsCount: syncedCards.length,
      notSyncedCardsCount: Math.max(totalCards - syncedCards.length, 0),
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

  const submitForm = () => {
    if (isBusy) return;
    if (mode === 'signin') handleSignIn();
    else handleSignUp();
  };

  return (
    <div className="flex min-h-full justify-center px-4 pb-24 pt-5">
      <div className="w-full max-w-[380px]">
        {/* ── Header: logo + heading ─────────────────────────────── */}
        <div className="mb-4 flex items-center gap-2.5">
          <img
            src={brandLogoUrl}
            alt="Vaulto Cards"
            className="h-9 w-9 shrink-0 rounded-card border border-line bg-white object-contain p-1"
          />
          <div className="min-w-0">
            <div className="text-[17px] font-bold leading-tight tracking-tight text-gray-900">
              {heading}
            </div>
            <div className="text-[12px] leading-snug text-gray-500">{subtitle}</div>
          </div>
        </div>

        {isSignedIn ? (
          /* ── Signed in: account overview ──────────────────────── */
          <div className="flex flex-col gap-4">
            <div className="rounded-sheet border border-line bg-surface-muted p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Vaulto account
                </span>
                <StatusChip label={cloudStatusLabel} tone={cloudStatusTone} />
              </div>
              <div
                className="mt-3 truncate rounded-card border border-line bg-white px-3 py-2.5 text-[15px] font-semibold text-gray-900"
                title={auth.user?.email || 'Unknown user'}
              >
                {auth.user?.email || 'Unknown user'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <MetricTile
                icon={<FaLayerGroup size={14} />}
                label="Cards"
                value={accountOverview.totalCards}
                accent="#1A1A1A"
              />
              <MetricTile
                icon={<FaCheckCircle size={14} />}
                label="Synced"
                value={accountOverview.syncedCardsCount}
                accent="#10B981"
              />
              <MetricTile
                icon={<FaClock size={14} />}
                label="Not synced"
                value={accountOverview.notSyncedCardsCount}
                accent="#F59E0B"
              />
            </div>

            <Button
              variant="danger"
              size="lg"
              fullWidth
              onClick={() => setShowSignOutConfirm(true)}
              disabled={isBusy}
            >
              Sign out
            </Button>
          </div>
        ) : verificationState !== 'idle' ? (
          /* ── Email verification waiting / done ────────────────── */
          <div className="flex flex-col items-center rounded-sheet border border-line bg-white p-6 text-center shadow-card">
            <span
              className={`flex h-16 w-16 items-center justify-center rounded-sheet text-2xl ${
                verificationState === 'verified'
                  ? 'bg-ok-subtle text-ok-strong'
                  : 'bg-accent-subtle text-accent'
              }`}
            >
              {verificationState === 'verified' ? (
                <FaCheckCircle size={30} />
              ) : (
                <FaEnvelope size={26} />
              )}
            </span>

            <div className="mt-4 text-[14px] leading-relaxed text-gray-500">
              {verificationState === 'verified' ? (
                'Your account has been verified. Signing you in now…'
              ) : (
                <>
                  We sent a verification link to
                  <br />
                  <strong className="text-gray-900">{verificationEmail}</strong>
                </>
              )}
            </div>

            <div className="mt-4 flex w-full items-center justify-center gap-2 rounded-card border border-line bg-surface-muted px-3 py-2.5 text-[12px] text-gray-500">
              {verificationState !== 'verified' && (
                <Loader type="spinner" size="small" inline color="#0066FF" />
              )}
              <span>
                {verificationState === 'verified'
                  ? 'Verification complete. One moment…'
                  : 'Waiting for confirmation — this updates automatically.'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                resetVerificationState();
                setMode('signin');
                setNotice('');
                setError('');
              }}
              className="mt-4 text-[13px] font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-control"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          /* ── Sign in / sign up form ───────────────────────────── */
          <div className="rounded-sheet border border-line bg-white p-4 shadow-card">
            <div className="flex flex-col gap-3">
              <div>
                <label className={FIELD_LABEL_CLASS} htmlFor="auth-email">
                  Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitForm()}
                  placeholder="name@example.com"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className={FIELD_LABEL_CLASS} htmlFor="auth-password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitForm()}
                    placeholder="Enter your password"
                    className={`${INPUT_CLASS} pr-14`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-control px-1.5 py-1 text-[12px] font-semibold text-gray-500 transition-colors hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className={FIELD_LABEL_CLASS} htmlFor="auth-confirm">
                    Confirm password
                  </label>
                  <input
                    id="auth-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitForm()}
                    placeholder="Repeat password"
                    className={INPUT_CLASS}
                  />
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={submitForm}
                disabled={isBusy}
                className="mt-1"
              >
                {isBusy ? (
                  <>
                    <Loader type="spinner" size="small" inline color="#FFFFFF" />
                    Please wait…
                  </>
                ) : mode === 'signin' ? (
                  'Sign in'
                ) : (
                  'Sign up'
                )}
              </Button>

              <div className="my-1 flex items-center gap-2">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[12px] text-gray-400">or continue with</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <Button
                variant="secondary"
                size="lg"
                fullWidth
                onClick={handleGoogleSignIn}
                disabled={isBusy}
              >
                Continue with Google
              </Button>
            </div>

            {error && (
              <div className="mt-3 rounded-card border border-danger-border bg-danger-subtle px-3 py-2 text-center text-[13px] leading-snug text-danger-strong">
                {error}
              </div>
            )}
            {notice && (
              <div className="mt-3 text-center text-[13px] leading-snug text-gray-500">
                {notice}
              </div>
            )}

            <div className="mt-4 text-center text-[13px] text-gray-500">
              {mode === 'signin' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      resetVerificationState();
                      setMode('signup');
                      setError('');
                      setNotice('');
                    }}
                    className="font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-control"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      resetVerificationState();
                      setMode('signin');
                      setError('');
                      setNotice('');
                    }}
                    className="font-semibold text-accent transition-colors hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-control"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={showSignOutConfirm}
        onClose={() => setShowSignOutConfirm(false)}
        title="Sign out?"
      >
        <div className="px-4 py-4">
          <p className="m-0 text-[13px] leading-relaxed text-gray-500">
            You will be signed out on this device. Your saved cards stay intact.
          </p>
          <div className="mt-4 flex gap-2.5">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowSignOutConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              fullWidth
              disabled={isBusy}
              onClick={async () => {
                await handleSignOut();
                setShowSignOutConfirm(false);
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AuthScreen;
