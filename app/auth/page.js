'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const CATEGORIES = [
  { value: 'Tech', label: 'Tech / Coding' },
  { value: 'Business', label: 'Business / Entrepreneurship' },
  { value: 'Creative', label: 'Creative / Design' },
  { value: 'Science', label: 'Science / Engineering' },
];

const fieldClass =
  'mt-1.5 w-full rounded-xl border border-slate-700 bg-[#0b121d] px-3.5 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-teal-400 focus:ring-2 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:opacity-60';

function getAuthErrorMessage(authError, action) {
  const message = authError?.message || '';
  const isRateLimit = authError?.status === 429
    || /rate.?limit|too many requests|over_email_send_rate_limit/i.test(`${authError?.code || ''} ${message}`);

  if (isRateLimit && action === 'signup') {
    return 'Email sign-up is temporarily paused because too many confirmation emails were requested. Wait before trying again. If you already created an account, sign in instead. If this keeps happening, the project administrator can configure a custom SMTP provider in Supabase.';
  }

  if (isRateLimit) {
    return 'Too many sign-in attempts. Please wait a while before trying again.';
  }

  return message || 'Something went wrong. Please try again.';
}

export default function AuthPage() {
  const router = useRouter();
  const formId = useId();
  const signupTabRef = useRef(null);
  const signinTabRef = useRef(null);
  const [mode, setMode] = useState('signup');
  const isSignUp = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [category, setCategory] = useState('Tech');
  const [goalText, setGoalText] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setStatus('');
    setFieldErrors({});
    setShowPassword(false);
  }

  function handleModeTabKeyDown(event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const nextMode = isSignUp ? 'signin' : 'signup';
      switchMode(nextMode);
      (nextMode === 'signup' ? signupTabRef : signinTabRef).current?.focus();
    }
  }

  function validate() {
    const next = {};
    if (isSignUp && !fullName.trim()) next.fullName = 'Enter your name so others can recognize you on the wall.';
    if (isSignUp && !goalText.trim()) next.goalText = 'Add a short goal to personalize your profile.';
    if (!email.trim()) next.email = 'Email is required.';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleAuth(e) {
    e.preventDefault();
    setError('');
    setStatus('');
    if (!validate()) return;

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (signUpError) {
          setError(getAuthErrorMessage(signUpError, 'signup'));
          return;
        }

        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').insert([
            {
              id: data.user.id,
              full_name: fullName.trim(),
              category,
              goal_text: goalText.trim(),
              current_streak: 0,
            },
          ]);

          if (profileError) {
            setError('Account created, but we could not save your profile. Try signing in, then update your details.');
            return;
          }
        }

        setStatus('Account created. Check your email to confirm, then you can sign in.');
        setMode('signin');
        setPassword('');
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          setError(getAuthErrorMessage(signInError, 'signin'));
          return;
        }

        router.push(data.user?.app_metadata?.role === 'admin' ? '/?tab=admin' : '/');
      }
    } catch (err) {
      setError(getAuthErrorMessage(err, isSignUp ? 'signup' : 'signin'));
    } finally {
      setLoading(false);
    }
  }

  function describedBy(id, extra) {
    return [id, extra].filter(Boolean).join(' ') || undefined;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080f18] px-4 py-8 text-slate-100 md:px-8 md:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(20,184,166,0.16),_transparent_55%)]" />

      <div className="relative mx-auto flex w-full max-w-md flex-col gap-5">
        <Link
          href="/"
          className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-semibold text-slate-400 transition-colors hover:text-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to homepage
        </Link>

        <section className="rounded-2xl border border-teal-900/50 bg-[#101a26]/95 p-6 shadow-2xl shadow-black/30 backdrop-blur md:p-8">
          <div
            role="tablist"
            aria-label="Account access"
            className="grid grid-cols-2 gap-1 rounded-xl border border-slate-700/80 bg-[#080f18]/80 p-1.5"
          >
            <button
              type="button"
              ref={signupTabRef}
              id={`${formId}-signup-tab`}
              role="tab"
              aria-selected={isSignUp}
              tabIndex={isSignUp ? 0 : -1}
              aria-controls={`${formId}-auth-panel`}
              onClick={() => switchMode('signup')}
              onKeyDown={handleModeTabKeyDown}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                isSignUp ? 'bg-teal-700 text-white shadow-lg shadow-teal-950/30' : 'text-slate-400 hover:text-teal-100'
              }`}
            >
              Create account
            </button>
            <button
              type="button"
              ref={signinTabRef}
              id={`${formId}-signin-tab`}
              role="tab"
              aria-selected={!isSignUp}
              tabIndex={!isSignUp ? 0 : -1}
              aria-controls={`${formId}-auth-panel`}
              onClick={() => switchMode('signin')}
              onKeyDown={handleModeTabKeyDown}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                !isSignUp ? 'bg-teal-700 text-white shadow-lg shadow-teal-950/30' : 'text-slate-400 hover:text-teal-100'
              }`}
            >
              Sign in
            </button>
          </div>

          <div
            id={`${formId}-auth-panel`}
            role="tabpanel"
            aria-labelledby={`${formId}-${isSignUp ? 'signup' : 'signin'}-tab`}
            className="mt-6"
          >
            <div className="mb-6 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">Project Odyssey</p>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h1>
              <p className="text-sm leading-6 text-slate-400">
                {isSignUp
                  ? 'Start building momentum with a goal that matters to you.'
                  : 'Sign in to continue your progress.'}
              </p>
            </div>

          <form
            onSubmit={handleAuth}
            className="space-y-4"
            noValidate
            aria-busy={loading}
          >
            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-amber-800/60 bg-amber-950/40 px-3.5 py-3 text-sm text-amber-100"
              >
                {error}
                {isSignUp && /temporarily paused/.test(error) ? (
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="mt-3 block min-h-10 rounded-lg border border-amber-700/70 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-900/50"
                  >
                    Go to sign in
                  </button>
                ) : null}
              </div>
            ) : null}

            {status ? (
              <div
                role="status"
                className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 px-3.5 py-3 text-sm text-emerald-200"
              >
                {status}
              </div>
            ) : null}

            {isSignUp ? (
              <>
                <div>
                  <label htmlFor={`${formId}-name`} className="text-xs font-semibold text-slate-300">
                    Full name
                  </label>
                  <input
                    id={`${formId}-name`}
                    type="text"
                    autoComplete="name"
                    required
                    placeholder="e.g. Alex Smith"
                    className={`${fieldClass} ${fieldErrors.fullName ? 'border-rose-500 focus:ring-rose-500/40' : ''}`}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    aria-describedby={describedBy(fieldErrors.fullName ? `${formId}-name-error` : undefined)}
                  />
                  {fieldErrors.fullName ? (
                    <p id={`${formId}-name-error`} className="mt-1.5 text-xs text-rose-300">
                      {fieldErrors.fullName}
                    </p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor={`${formId}-category`} className="text-xs font-semibold text-slate-300">
                    Interest category
                  </label>
                  <select
                    id={`${formId}-category`}
                    className={fieldClass}
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={loading}
                  >
                    {CATEGORIES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor={`${formId}-goal`} className="text-xs font-semibold text-slate-300">
                    Your main goal
                  </label>
                  <input
                    id={`${formId}-goal`}
                    type="text"
                    required
                    placeholder="e.g. Build an app prototype by end of month"
                    className={`${fieldClass} ${fieldErrors.goalText ? 'border-rose-500 focus:ring-rose-500/40' : ''}`}
                    value={goalText}
                    onChange={(e) => setGoalText(e.target.value)}
                    disabled={loading}
                    aria-invalid={Boolean(fieldErrors.goalText)}
                    aria-describedby={describedBy(fieldErrors.goalText ? `${formId}-goal-error` : undefined)}
                  />
                  {fieldErrors.goalText ? (
                    <p id={`${formId}-goal-error`} className="mt-1.5 text-xs text-rose-300">
                      {fieldErrors.goalText}
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}

            <div>
              <label htmlFor={`${formId}-email`} className="text-xs font-semibold text-slate-300">
                Email address
              </label>
              <input
                id={`${formId}-email`}
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                placeholder="you@example.com"
                className={`${fieldClass} ${fieldErrors.email ? 'border-rose-500 focus:ring-rose-500/40' : ''}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={describedBy(fieldErrors.email ? `${formId}-email-error` : undefined)}
              />
              {fieldErrors.email ? (
                <p id={`${formId}-email-error`} className="mt-1.5 text-xs text-rose-300">
                  {fieldErrors.email}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor={`${formId}-password`} className="text-xs font-semibold text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  id={`${formId}-password`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className={`${fieldClass} pr-12 ${fieldErrors.password ? 'border-rose-500 focus:ring-rose-500/40' : ''}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={describedBy(
                    `${formId}-password-hint`,
                    fieldErrors.password ? `${formId}-password-error` : undefined
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p id={`${formId}-password-hint`} className="mt-1.5 text-xs text-slate-500">
                {isSignUp ? 'Choose a password you have not used on other student tools.' : 'Use the password you created when you joined Odyssey.'}
              </p>
              {fieldErrors.password ? (
                <p id={`${formId}-password-error`} className="mt-1 text-xs text-rose-300">
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-950/30 transition-all hover:bg-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (isSignUp ? 'Creating account…' : 'Signing in…') : isSignUp ? 'Join Odyssey' : 'Sign in'}
              {!loading ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
            </button>
          </form>
          </div>
        </section>
      </div>
    </main>
  );
}
