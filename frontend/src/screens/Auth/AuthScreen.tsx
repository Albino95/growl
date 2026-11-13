import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Easing,
  Image,
  LayoutAnimation,
  UIManager,
  AccessibilityInfo,
} from 'react-native';
import PressableScale from '../../components/ui/PressableScale';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import Screen from '../../components/ui/Screen';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { formInputAccessoryProps } from '../../components/ui/KeyboardDoneAccessory';
import AuthModeSwitch from '../../components/auth/AuthModeSwitch';
import CodeInput, { type CodeInputHandle } from '../../components/auth/CodeInput';
import { AUTH_EASE_OUT, runShake } from '../../components/auth/authMotion';
import { onBootSplashDone } from '../../components/auth/bootSplashSignal';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAuth } from '../../store/hooks';
import { validatePasswordStrength } from '../../utils/passwordPolicy';
import { triggerFeedback } from '../../utils/interactionFeedback';
import {
  isGoogleOAuthConfigured,
  isFacebookOAuthConfigured,
  signInWithGooglePrompt,
  signInWithFacebookPrompt,
} from '../../services/auth/oauth';
import { isAppleSignInAvailable, signInWithApplePrompt } from '../../services/auth/apple';
import { featureFlags } from '../../constants/featureFlags';
import {
  forgotPasswordApi,
  resetPasswordApi,
  resendVerificationApi,
} from '../../services/api/auth';
import {
  savePendingVerification,
  loadPendingVerification,
  clearPendingVerification,
} from '../../services/storage/pendingVerification';
import {
  clearPendingInviteCode,
  loadPendingInviteCode,
  normalizeInviteCode,
  subscribePendingInviteCode,
} from '../../services/storage/pendingInvite';
import tw, { theme, getColorSchemeName } from '../../lib/tw';
import { radius } from '../../theme/tokens';

// LayoutAnimation is opt-in on Android's legacy renderer; Fabric ignores (and warns on) this.
if (
  Platform.OS === 'android' &&
  typeof UIManager.setLayoutAnimationEnabledExperimental === 'function' &&
  !(globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function defaultVerificationExpiry(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function authErrorMessage(e: unknown, fallback: string): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

function isUnverifiedError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes('confirm your email') || msg.includes('before signing in');
}

function isExpiredSignupError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes('expired after 24') || msg.includes('sign up again');
}

type Step = 'auth' | 'verify' | 'forgot' | 'reset';
type Banner = { tone: 'error' | 'info'; text: string } | null;

/** Depth used to pick the slide direction between steps. */
const STEP_DEPTH: Record<Step, number> = { auth: 0, forgot: 1, verify: 1, reset: 2 };

const PASSWORD_RULES = [
  { key: 'len', label: '12+ characters', test: (p: string) => p.length >= 12 },
  { key: 'upper', label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'num', label: 'Number', test: (p: string) => /[0-9]/.test(p) },
  { key: 'sym', label: 'Symbol', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

/** Mirrors src/utils/passwordPolicy.ts so iOS strong-password suggestions pass validation. */
const IOS_PASSWORD_RULES =
  'minlength: 12; maxlength: 128; required: lower; required: upper; required: digit; required: special;';

const RESEND_COOLDOWN_S = 30;
const SUCCESS_HOLD_MS = 250;

const DEMO_ACCOUNTS = [
  { email: 'demo@growl.app', label: 'Learner' },
  { email: 'instructor@growl.app', label: 'Instructor' },
  { email: 'business@growl.app', label: 'Business' },
];

/** Animate the next layout pass (rows appearing/disappearing). */
function animateNextLayout(reducedMotion: boolean) {
  if (reducedMotion) {
    LayoutAnimation.configureNext({
      duration: 150,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    return;
  }
  LayoutAnimation.configureNext({
    duration: 220,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'spring', springDamping: 0.8 },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });
}

function stepCopy(step: Step, isSignUp: boolean): { title: string; subtitle: string } {
  switch (step) {
    case 'forgot':
      return {
        title: 'Reset password',
        subtitle: "We'll email you a code to get back into your account.",
      };
    case 'reset':
      return {
        title: 'Choose a new password',
        subtitle: 'Enter the code from your email, then set something strong.',
      };
    case 'verify':
      return { title: 'Confirm your email', subtitle: "One quick step, then you're in." };
    default:
      return isSignUp
        ? {
            title: 'Start growing',
            subtitle: 'Pick your paths, share progress, grow with people on the same journey.',
          }
        : { title: 'Welcome back', subtitle: 'Pick up where you left off with your circle.' };
  }
}

function AuthAtmosphere() {
  return (
    <View pointerEvents="none" style={tw`absolute inset-0 overflow-hidden`}>
      <View
        style={[
          tw`absolute rounded-full bg-emerald-600/10`,
          { width: 280, height: 280, top: -80, right: -90 },
        ]}
      />
      <View
        style={[
          tw`absolute rounded-full bg-raised`,
          { width: 220, height: 220, top: 180, left: -110, opacity: 0.7 },
        ]}
      />
      <View
        style={[
          tw`absolute rounded-full bg-energy-600/10`,
          { width: 160, height: 160, bottom: 120, right: -40 },
        ]}
      />
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-1.5 ml-0.5`}>
      {children}
    </Text>
  );
}

/** Fades in on mount; text changes in place. */
function FadeIn({ children, style }: { children: React.ReactNode; style?: object }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.timing(opacity, {
      toValue: 1,
      duration: 150,
      easing: AUTH_EASE_OUT,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <FadeIn>
      <Text style={tw`text-xs text-red-600 mt-1 ml-1`} accessibilityLiveRegion="polite">
        {message}
      </Text>
    </FadeIn>
  );
}

function InlineBanner({ banner }: { banner: Banner }) {
  if (!banner) return null;
  const isError = banner.tone === 'error';
  return (
    <FadeIn
      style={tw`flex-row items-start mb-4 px-3.5 py-3 rounded-card border ${
        isError ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
      }`}
    >
      <Ionicons
        name={isError ? 'alert-circle' : 'checkmark-circle'}
        size={18}
        color={isError ? theme.colors.danger : '#059669'}
        style={tw`mt-px`}
      />
      <Text
        style={tw`flex-1 ml-2 text-sm leading-5 ${isError ? 'text-red-700' : 'text-emerald-800'}`}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        {banner.text}
      </Text>
    </FadeIn>
  );
}

function RuleRow({ label, ok, reducedMotion }: { label: string; ok: boolean; reducedMotion: boolean }) {
  const pop = useRef(new Animated.Value(1)).current;
  const prevOk = useRef(ok);
  useEffect(() => {
    if (ok && !prevOk.current && !reducedMotion) {
      pop.setValue(0.6);
      Animated.spring(pop, {
        toValue: 1,
        damping: 10,
        stiffness: 320,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    }
    prevOk.current = ok;
  }, [ok, pop, reducedMotion]);
  return (
    <View
      style={tw`flex-row items-center py-1`}
      accessible
      accessibilityLabel={`${label}${ok ? ', done' : ''}`}
    >
      <Animated.View style={{ transform: [{ scale: pop }] }}>
        <Ionicons
          name={ok ? 'checkmark-circle' : 'ellipse-outline'}
          size={16}
          color={ok ? '#059669' : theme.colors.iconMuted}
        />
      </Animated.View>
      <Text style={tw`ml-2 text-xs ${ok ? 'text-emerald-700' : 'text-ink-3'}`}>{label}</Text>
    </View>
  );
}

function PasswordRules({
  status,
  reducedMotion,
  style,
}: {
  status: { key: string; label: string; ok: boolean }[];
  reducedMotion: boolean;
  style?: object;
}) {
  return (
    <View style={[tw`bg-raised/70 border border-line/60 rounded-card p-3`, style]}>
      {status.map((rule) => (
        <RuleRow key={rule.key} label={rule.label} ok={rule.ok} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

function inputBorder(hasError: boolean) {
  return hasError ? 'border-red-500' : 'border-line/80';
}

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [devResetHint, setDevResetHint] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [step, setStep] = useState<Step>('auth');
  const [cooldown, setCooldown] = useState(0);
  const [inviteCode, setInviteCode] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const {
    signIn,
    signUp,
    verifyEmail,
    signInWithSSO,
    markSignupOnboardingRequired,
    refreshProfile,
    isLoading,
    error,
  } = useAuth();
  const busy = localLoading || isLoading;
  const reducedMotion = useReducedMotion();
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;

  const scrollRef = useRef<ScrollView>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const newPasswordRef = useRef<TextInput>(null);
  const verifyCodeRef = useRef<CodeInputHandle>(null);
  const resetCodeRef = useRef<CodeInputHandle>(null);

  // ---- timers (all cleared on unmount) ----
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = setTimeout(() => {
        timersRef.current.delete(id);
        resolve();
      }, ms);
      timersRef.current.add(id);
    });

  // ---- entrance: mount only, after the cold-start splash is gone ----
  const entrance = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const markScale = useRef(new Animated.Value(0)).current;
  const [entranceStatic, setEntranceStatic] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let running: Animated.CompositeAnimation | null = null;

    const start = (reduced: boolean) => {
      if (cancelled || started) return;
      started = true;
      if (reduced) {
        setEntranceStatic(true);
        running = Animated.parallel(
          [...entrance, markScale].map((v) =>
            Animated.timing(v, { toValue: 1, duration: 150, useNativeDriver: true })
          )
        );
      } else {
        running = Animated.parallel([
          Animated.stagger(
            60,
            entrance.map((v) =>
              Animated.spring(v, {
                toValue: 1,
                damping: 18,
                stiffness: 180,
                mass: 1,
                useNativeDriver: true,
              })
            )
          ),
          Animated.spring(markScale, {
            toValue: 1,
            damping: 12,
            stiffness: 200,
            mass: 1,
            useNativeDriver: true,
          }),
        ]);
      }
      running.start();
    };

    const kick = () => {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((r) => start(!!r))
        .catch(() => start(false));
    };

    const unsubscribe = onBootSplashDone(kick);
    // Belt and braces: never leave the form invisible if the splash signal is missed.
    const fallback = setTimeout(kick, 6000);

    return () => {
      cancelled = true;
      unsubscribe();
      clearTimeout(fallback);
      running?.stop();
    };
  }, [entrance, markScale]);

  const entranceStyle = (v: Animated.Value) => ({
    opacity: v,
    transform: [
      {
        translateY: v.interpolate({
          inputRange: [0, 1],
          outputRange: entranceStatic ? [0, 0] : [16, 0],
        }),
      },
    ],
  });

  // ---- title / subtitle crossfade ----
  const targetCopy = stepCopy(step, isSignUp);
  const [shownCopy, setShownCopy] = useState(targetCopy);
  const titleOpacity = useRef(new Animated.Value(1)).current;
  const titleRise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const reduced = reducedRef.current;
    if (targetCopy.title === shownCopy.title && targetCopy.subtitle === shownCopy.subtitle) {
      // Toggled back before the swap happened: make sure the current copy is visible.
      const settle = Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: reduced ? 90 : 180, useNativeDriver: true }),
        Animated.timing(titleRise, { toValue: 0, duration: reduced ? 0 : 180, useNativeDriver: true }),
      ]);
      settle.start();
      return () => settle.stop();
    }
    let inAnim: Animated.CompositeAnimation | null = null;
    const outAnim = Animated.timing(titleOpacity, {
      toValue: 0,
      duration: reduced ? 60 : 120,
      easing: AUTH_EASE_OUT,
      useNativeDriver: true,
    });
    outAnim.start(({ finished }) => {
      if (!finished) return;
      setShownCopy(targetCopy);
      titleRise.setValue(reduced ? 0 : 6);
      inAnim = Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: reduced ? 90 : 180,
          easing: AUTH_EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(titleRise, {
          toValue: 0,
          duration: reduced ? 0 : 180,
          easing: AUTH_EASE_OUT,
          useNativeDriver: true,
        }),
      ]);
      inAnim.start();
    });
    return () => {
      outAnim.stop();
      inAnim?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCopy.title, targetCopy.subtitle]);

  // ---- direction-aware step slide ----
  const stepX = useRef(new Animated.Value(0)).current;
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const prevStepRef = useRef<Step>(step);
  const stepAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  useLayoutEffect(() => {
    const prev = prevStepRef.current;
    if (prev === step) return;
    prevStepRef.current = step;
    const dir = STEP_DEPTH[step] >= STEP_DEPTH[prev] ? 1 : -1;
    const reduced = reducedRef.current;
    stepAnimRef.current?.stop();
    stepX.setValue(reduced ? 0 : 24 * dir);
    stepOpacity.setValue(0);
    stepAnimRef.current = Animated.parallel([
      Animated.timing(stepX, {
        toValue: 0,
        duration: reduced ? 0 : 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(stepOpacity, {
        toValue: 1,
        duration: reduced ? 150 : 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    stepAnimRef.current.start();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step, stepX, stepOpacity]);

  useEffect(() => () => stepAnimRef.current?.stop(), []);

  // ---- shakes ----
  const cardShake = useRef(new Animated.Value(0)).current;
  const emailShake = useRef(new Animated.Value(0)).current;
  const passwordShake = useRef(new Animated.Value(0)).current;

  const failCard = (text: string) => {
    triggerFeedback('error');
    setBanner({ tone: 'error', text });
    runShake(cardShake, reducedRef.current);
  };

  // ---- resend cooldown ----
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);
  const startCooldown = () => setCooldown(RESEND_COOLDOWN_S);
  const resendLabel =
    cooldown > 0 ? `Resend code in 0:${String(cooldown).padStart(2, '0')}` : 'Resend code';

  useEffect(() => {
    let cancelled = false;
    void loadPendingVerification().then((pending) => {
      if (cancelled || !pending) return;
      setEmail(pending.email);
      setDevCodeHint(pending.devCode ?? null);
      setStep('verify');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const showApple = isAppleSignInAvailable();
  const showGoogle = isGoogleOAuthConfigured();
  const showFacebook = isFacebookOAuthConfigured();
  const showSocialAuth = showApple || showGoogle || showFacebook;

  const passwordRuleStatus = useMemo(
    () => PASSWORD_RULES.map((r) => ({ key: r.key, label: r.label, ok: r.test(password) })),
    [password]
  );

  // Invite code captured from a deep link while signed out → prefill sign-up.
  useEffect(() => {
    let alive = true;
    const apply = (code: string | null) => {
      if (!alive || !code) return;
      setInviteCode(code);
      setShowInvite(true);
      setIsSignUp(true);
    };
    void loadPendingInviteCode().then(apply);
    const unsubscribe = subscribePendingInviteCode(apply);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  /** Mode switch with sign-up-only rows animating in/out. */
  const setMode = (next: boolean) => {
    if (next === isSignUp) return;
    animateNextLayout(reducedRef.current);
    setIsSignUp(next);
  };

  const onEmailChange = (v: string) => {
    setEmail(v);
    if (emailError) setEmailError(null);
    if (banner?.tone === 'error') setBanner(null);
  };

  const onPasswordChange = (v: string) => {
    // The rules panel appears when the first character is typed.
    if ((password.length === 0) !== (v.length === 0)) animateNextLayout(reducedRef.current);
    setPassword(v);
    if (passwordError) setPasswordError(null);
    if (banner?.tone === 'error') setBanner(null);
  };

  const handleEmailAuth = async () => {
    if (busy) return;
    const trimmedEmail = email.trim().toLowerCase();
    setEmailError(null);
    setPasswordError(null);
    setBanner(null);
    if (!trimmedEmail || !password) {
      triggerFeedback('error');
      if (!trimmedEmail) {
        setEmailError('Email is required.');
        runShake(emailShake, reducedRef.current);
        emailRef.current?.focus();
      }
      if (!password) {
        setPasswordError('Password is required.');
        runShake(passwordShake, reducedRef.current);
        if (trimmedEmail) passwordRef.current?.focus();
      }
      return;
    }

    const pwCheck = validatePasswordStrength(password);
    if (isSignUp && !pwCheck.ok) {
      triggerFeedback('error');
      setPasswordError(pwCheck.message);
      runShake(passwordShake, reducedRef.current);
      return;
    }

    setLocalLoading(true);
    try {
      if (isSignUp) {
        const invite = normalizeInviteCode(inviteCode);
        const result = await signUp(trimmedEmail, password, undefined, invite || undefined).unwrap();
        if (invite) void clearPendingInviteCode();
        markSignupOnboardingRequired();
        setDevCodeHint(result.devVerificationCode ?? null);
        await savePendingVerification({
          email: result.email || trimmedEmail,
          expiresAt: result.expiresAt || defaultVerificationExpiry(),
          devCode: result.devVerificationCode ?? null,
        });
        triggerFeedback('success');
        setStep('verify');
        setPassword('');
        setVerifyCode('');
        setCodeError(null);
        startCooldown();
        if (result.message) setBanner({ tone: 'info', text: result.message });
      } else {
        await signIn(trimmedEmail, password).unwrap();
        // The navigator swaps to the app as soon as the token lands; the check
        // shows for however long this screen stays mounted (never delays entry).
        triggerFeedback('success');
        setSuccess(true);
        // If the navigator hasn't swapped us out by then, release the button again.
        void wait(1500).then(() => setSuccess(false));
        await clearPendingVerification();
        void refreshProfile();
      }
    } catch (e: unknown) {
      const msg = authErrorMessage(e, error || 'Authentication failed');
      if (!isSignUp && isUnverifiedError(msg)) {
        await savePendingVerification({
          email: trimmedEmail,
          expiresAt: defaultVerificationExpiry(),
        });
        setStep('verify');
        setVerifyCode('');
        setBanner({
          tone: 'info',
          text: 'Your account is waiting. Enter the 6-digit code we sent. It stays valid for 24 hours.',
        });
        return;
      }
      if (isExpiredSignupError(msg)) {
        await clearPendingVerification();
        setMode(true);
        failCard(msg);
        return;
      }
      const alreadyExists =
        isSignUp && typeof msg === 'string' && msg.toLowerCase().includes('already exists');
      if (alreadyExists) {
        setMode(false);
        triggerFeedback('warn');
        setBanner({ tone: 'info', text: `${msg} Switched to sign in, so use your password.` });
        passwordRef.current?.focus();
      } else {
        failCard(msg);
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleVerify = async (codeArg?: string) => {
    if (busy) return;
    const code = (codeArg ?? verifyCode).trim();
    setBanner(null);
    if (code.length === 0) {
      triggerFeedback('error');
      verifyCodeRef.current?.rejectAndClear();
      setCodeError('Enter the 6-digit code from your email.');
      return;
    }
    setLocalLoading(true);
    try {
      await verifyEmail(email.trim().toLowerCase(), code).unwrap();
      await clearPendingVerification();
      triggerFeedback('success');
      setSuccess(true);
      await wait(SUCCESS_HOLD_MS);
      setSuccess(false);
      setStep('auth');
      setIsSignUp(false);
      setVerifyCode('');
      setCodeError(null);
      setDevCodeHint(null);
      setBanner({ tone: 'info', text: 'Email verified. You can sign in now.' });
    } catch (e: unknown) {
      const msg = authErrorMessage(e, 'Invalid code');
      if (isExpiredSignupError(msg)) {
        await clearPendingVerification();
        setStep('auth');
        setIsSignUp(true);
        failCard(msg);
        return;
      }
      triggerFeedback('error');
      verifyCodeRef.current?.rejectAndClear();
      setCodeError(msg);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (busy || cooldown > 0) return;
    const trimmedEmail = email.trim().toLowerCase();
    setBanner(null);
    if (!trimmedEmail) {
      failCard('Enter the email we should send the code to.');
      return;
    }
    setLocalLoading(true);
    try {
      const result = await resendVerificationApi(trimmedEmail);
      setDevCodeHint(result.devVerificationCode ?? null);
      await savePendingVerification({
        email: result.email || trimmedEmail,
        expiresAt: result.expiresAt || defaultVerificationExpiry(),
        devCode: result.devVerificationCode ?? null,
      });
      startCooldown();
      setCodeError(null);
      setBanner({
        tone: 'info',
        text: result.message || 'Check your inbox for a new verification code.',
      });
      verifyCodeRef.current?.focus();
    } catch (e: unknown) {
      const msg = authErrorMessage(e, 'Could not resend the code');
      if (isExpiredSignupError(msg)) {
        await clearPendingVerification();
        setStep('auth');
        setIsSignUp(true);
      }
      failCard(msg);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogle = async () => {
    setBanner(null);
    if (!isGoogleOAuthConfigured()) {
      failCard('Google sign-in is not configured. Add googleWebClientId to app.config.ts extra, then rebuild the app.');
      return;
    }
    setLocalLoading(true);
    try {
      const idToken = await signInWithGooglePrompt();
      await signInWithSSO({ provider: 'google', idToken }).unwrap();
      triggerFeedback('success');
      void refreshProfile();
    } catch (e: unknown) {
      failCard(e instanceof Error ? e.message : 'Google sign-in failed');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleFacebook = async () => {
    setBanner(null);
    if (!isFacebookOAuthConfigured()) {
      failCard('Facebook sign-in is not configured. Add facebookAppId to app.config.ts extra, then rebuild.');
      return;
    }
    setLocalLoading(true);
    try {
      const accessToken = await signInWithFacebookPrompt();
      await signInWithSSO({ provider: 'facebook', accessToken }).unwrap();
      triggerFeedback('success');
      void refreshProfile();
    } catch (e: unknown) {
      failCard(e instanceof Error ? e.message : 'Facebook sign-in failed');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleApple = async () => {
    if (busy) return;
    setBanner(null);
    setLocalLoading(true);
    try {
      const idToken = await signInWithApplePrompt();
      await signInWithSSO({ provider: 'apple', idToken }).unwrap();
      triggerFeedback('success');
      void refreshProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed';
      const code = (e as { code?: unknown } | null)?.code;
      if (!msg.toLowerCase().includes('cancel') && code !== 'ERR_REQUEST_CANCELED') {
        failCard(msg === 'Failed' ? 'Apple sign-in failed' : msg);
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleDemoSignIn = (demoEmail: string) => {
    if (busy) return;
    setBanner(null);
    setEmail(demoEmail);
    setPassword('GrowlDemo123!');
    setIsSignUp(false);
    setLocalLoading(true);
    void signIn(demoEmail, 'GrowlDemo123!')
      .unwrap()
      .then(() => {
        triggerFeedback('success');
        void clearPendingVerification();
        void refreshProfile();
      })
      .catch((e: unknown) => {
        failCard(authErrorMessage(e, 'Could not sign in. Seed the demo accounts first.'));
      })
      .finally(() => setLocalLoading(false));
  };

  const handleForgotRequest = async () => {
    if (busy) return;
    const trimmedEmail = email.trim().toLowerCase();
    setBanner(null);
    if (!trimmedEmail) {
      triggerFeedback('error');
      setEmailError('Email is required.');
      runShake(emailShake, reducedRef.current);
      return;
    }
    setLocalLoading(true);
    try {
      const result = await forgotPasswordApi(trimmedEmail);
      setDevResetHint(result.devResetCode ?? null);
      setResetCode('');
      setPassword('');
      setCodeError(null);
      setPasswordError(null);
      setStep('reset');
      startCooldown();
      if (result.message) setBanner({ tone: 'info', text: result.message });
    } catch (e: unknown) {
      failCard(e instanceof Error ? e.message : 'Could not start password reset');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (busy) return;
    const trimmedEmail = email.trim().toLowerCase();
    setBanner(null);
    if (!resetCode.trim()) {
      triggerFeedback('error');
      resetCodeRef.current?.rejectAndClear();
      setCodeError('Enter the reset code from your email.');
      return;
    }
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.ok) {
      triggerFeedback('error');
      setPasswordError(pwCheck.message);
      runShake(passwordShake, reducedRef.current);
      newPasswordRef.current?.focus();
      return;
    }
    setLocalLoading(true);
    try {
      await resetPasswordApi({
        email: trimmedEmail,
        code: resetCode.trim(),
        password,
      });
      triggerFeedback('success');
      setSuccess(true);
      await wait(SUCCESS_HOLD_MS);
      setSuccess(false);
      setStep('auth');
      setIsSignUp(false);
      setResetCode('');
      setPassword('');
      setCodeError(null);
      setDevResetHint(null);
      setBanner({ tone: 'info', text: 'Password updated. Sign in with your new password.' });
    } catch (e: unknown) {
      failCard(e instanceof Error ? e.message : 'Invalid code or password');
    } finally {
      setLocalLoading(false);
    }
  };

  const goToStep = (next: Step) => {
    setBanner(null);
    setEmailError(null);
    setPasswordError(null);
    setCodeError(null);
    setSuccess(false);
    setStep(next);
  };

  // Only the iOS Done bar id from the shared helper; return keys are set per field.
  const accessoryId = formInputAccessoryProps().inputAccessoryViewID;

  const devHint = (text: string) => (
    <Text style={tw`text-xs text-amber-900 bg-amber-50 border border-amber-100 p-3 rounded-card mb-4`}>
      {text}
    </Text>
  );

  const emailField = (opts: { onSubmit: () => void; returnKeyType: 'next' | 'send'; label?: string }) => (
    <View>
      <FieldLabel>Email</FieldLabel>
      <Animated.View style={[tw`relative`, { transform: [{ translateX: emailShake }] }]}>
        <TextInput
          ref={emailRef}
          inputAccessoryViewID={accessoryId}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          returnKeyType={opts.returnKeyType}
          submitBehavior={opts.returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={opts.onSubmit}
          value={email}
          onChangeText={onEmailChange}
          style={tw`border ${inputBorder(!!emailError)} bg-card rounded-card py-3.5 pl-11 pr-4 text-base text-ink`}
          placeholderTextColor={theme.colors.ink3}
          accessibilityLabel={opts.label ?? 'Email'}
        />
        <Ionicons name="mail-outline" size={20} color={theme.colors.ink3} style={tw`absolute left-4 top-4`} />
      </Animated.View>
      <FieldError message={emailError} />
    </View>
  );

  const eyeToggle = (
    <PressableScale
      onPress={() => setShowPassword((v) => !v)}
      style={tw`absolute right-3 top-3.5 p-1`}
      hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
      accessibilityRole="button"
      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
    >
      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={theme.colors.ink3} />
    </PressableScale>
  );

  // ---------------- step bodies ----------------

  const forgotBody = (
    <>
      <InlineBanner banner={banner} />
      <View style={tw`mb-5`}>
        {emailField({
          onSubmit: () => void handleForgotRequest(),
          returnKeyType: 'send',
          label: 'Email for password reset',
        })}
      </View>
      <PrimaryButton
        label="Send reset code"
        onPress={() => void handleForgotRequest()}
        disabled={busy}
        loading={busy}
      />
      <PressableScale
        onPress={() => goToStep('auth')}
        style={tw`mt-4 py-3 items-center`}
        accessibilityRole="button"
      >
        <Text style={tw`text-emerald-700 font-semibold`}>Back to sign in</Text>
      </PressableScale>
    </>
  );

  const resetBody = (
    <>
      <InlineBanner banner={banner} />
      {featureFlags.showDevVerificationHint && devResetHint ? devHint(`Dev reset code: ${devResetHint}`) : null}
      <FieldLabel>Reset code</FieldLabel>
      <CodeInput
        ref={resetCodeRef}
        value={resetCode}
        onChangeText={(v) => {
          setResetCode(v);
          if (codeError) setCodeError(null);
        }}
        onComplete={() => newPasswordRef.current?.focus()}
        hasError={!!codeError}
        reducedMotion={reducedMotion}
        accessibilityLabel="Password reset code"
      />
      <FieldError message={codeError} />
      <View style={tw`mt-4`}>
        <FieldLabel>New password</FieldLabel>
        <Animated.View style={[tw`relative`, { transform: [{ translateX: passwordShake }] }]}>
          <TextInput
            ref={newPasswordRef}
            inputAccessoryViewID={accessoryId}
            placeholder="Create a strong password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={onPasswordChange}
            textContentType="newPassword"
            autoComplete="new-password"
            passwordRules={IOS_PASSWORD_RULES}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void handleResetPassword()}
            style={tw`border ${inputBorder(!!passwordError)} bg-card rounded-card py-3.5 pl-4 pr-12 text-base text-ink`}
            placeholderTextColor={theme.colors.ink3}
            accessibilityLabel="New password"
          />
          {eyeToggle}
        </Animated.View>
        <FieldError message={passwordError} />
      </View>
      {password.length > 0 ? (
        <PasswordRules status={passwordRuleStatus} reducedMotion={reducedMotion} style={tw`mt-3`} />
      ) : null}
      <View style={tw`mt-4`}>
        <PrimaryButton
          label="Update password"
          onPress={() => void handleResetPassword()}
          disabled={busy}
          loading={busy && !success}
          success={success}
        />
      </View>
      <PressableScale
        onPress={() => goToStep('forgot')}
        disabled={cooldown > 0}
        style={tw`mt-4 py-3 items-center`}
        accessibilityRole="button"
        accessibilityState={{ disabled: cooldown > 0 }}
      >
        <Text style={tw`font-semibold ${cooldown > 0 ? 'text-ink-3' : 'text-emerald-700'}`}>
          {resendLabel}
        </Text>
      </PressableScale>
    </>
  );

  const verifyBody = (
    <>
      <Text style={tw`text-ink-2 mb-5 leading-5`}>
        We sent a 6-digit code to{' '}
        <Text style={tw`font-semibold text-stone-800`}>{email.trim().toLowerCase()}</Text>. It stays
        valid for 24 hours, so you can leave and come back.
      </Text>
      <InlineBanner banner={banner} />
      {featureFlags.showDevVerificationHint && devCodeHint ? devHint(`Dev code: ${devCodeHint}`) : null}
      <FieldLabel>Verification code</FieldLabel>
      <CodeInput
        ref={verifyCodeRef}
        value={verifyCode}
        onChangeText={(v) => {
          setVerifyCode(v);
          if (codeError) setCodeError(null);
        }}
        onComplete={(code) => void handleVerify(code)}
        hasError={!!codeError}
        reducedMotion={reducedMotion}
        accessibilityLabel="Verification code"
      />
      <FieldError message={codeError} />
      <View style={tw`mt-5`}>
        <PrimaryButton
          label="Confirm email"
          onPress={() => void handleVerify()}
          disabled={busy}
          loading={busy && !success}
          success={success}
        />
      </View>
      <PressableScale
        onPress={() => void handleResendVerification()}
        disabled={busy || cooldown > 0}
        style={tw`mt-4 py-3 items-center`}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || cooldown > 0 }}
      >
        <Text style={tw`font-semibold ${cooldown > 0 ? 'text-ink-3' : 'text-emerald-700'}`}>
          {resendLabel}
        </Text>
      </PressableScale>
      <PressableScale
        onPress={() => goToStep('auth')}
        style={tw`py-3 items-center`}
        accessibilityRole="button"
      >
        <Text style={tw`text-ink-3 font-semibold`}>Back to sign in</Text>
      </PressableScale>
      <PressableScale
        onPress={() => {
          void clearPendingVerification();
          goToStep('auth');
          setIsSignUp(true);
          setVerifyCode('');
          setDevCodeHint(null);
          setCooldown(0);
        }}
        style={tw`py-2 items-center`}
        accessibilityRole="button"
      >
        <Text style={tw`text-ink-2 text-sm`}>Use a different email</Text>
      </PressableScale>
    </>
  );

  const authBody = (
    <>
      <AuthModeSwitch
        isSignUp={isSignUp}
        reducedMotion={reducedMotion}
        disabled={busy}
        onChange={(next) => {
          setBanner(null);
          setEmailError(null);
          setPasswordError(null);
          setMode(next);
        }}
      />

      <InlineBanner banner={banner} />

      <View style={tw`gap-3 mb-2`}>
        {emailField({ onSubmit: () => passwordRef.current?.focus(), returnKeyType: 'next' })}

        <View>
          <FieldLabel>Password</FieldLabel>
          <Animated.View style={[tw`relative`, { transform: [{ translateX: passwordShake }] }]}>
            <TextInput
              ref={passwordRef}
              inputAccessoryViewID={accessoryId}
              placeholder={isSignUp ? 'Create a strong password' : 'Your password'}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={onPasswordChange}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              passwordRules={isSignUp ? IOS_PASSWORD_RULES : undefined}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => void handleEmailAuth()}
              style={tw`border ${inputBorder(!!passwordError)} bg-card rounded-card py-3.5 pl-11 pr-12 text-base text-ink`}
              placeholderTextColor={theme.colors.ink3}
              accessibilityLabel="Password"
            />
            <Ionicons
              name="lock-closed-outline"
              size={20}
              color={theme.colors.ink3}
              style={tw`absolute left-4 top-4`}
            />
            {eyeToggle}
          </Animated.View>
          <FieldError message={passwordError} />
        </View>
      </View>

      {isSignUp && password.length > 0 ? (
        <PasswordRules status={passwordRuleStatus} reducedMotion={reducedMotion} style={tw`mt-3 mb-4`} />
      ) : isSignUp ? (
        <Text style={tw`text-xs text-ink-3 mb-4 mt-2`}>
          Use 12+ characters with upper, lower, number, and symbol.
        </Text>
      ) : (
        <PressableScale
          onPress={() => goToStep('forgot')}
          style={tw`self-end mb-2 py-2`}
          hitSlop={{ left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Forgot password"
        >
          <Text style={tw`text-sm font-semibold text-emerald-700`}>Forgot password?</Text>
        </PressableScale>
      )}

      {isSignUp ? (
        showInvite ? (
          <View style={tw`mb-4`}>
            <FieldLabel>Invite code (optional)</FieldLabel>
            <View style={tw`relative`}>
              <TextInput
                inputAccessoryViewID={accessoryId}
                placeholder="e.g. 7K3Q9M2X"
                value={inviteCode}
                onChangeText={(v) => setInviteCode(v.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={16}
                returnKeyType="done"
                style={tw`border border-line/80 bg-card rounded-card py-3.5 pl-11 pr-4 text-base text-ink tracking-widest`}
                placeholderTextColor={theme.colors.ink3}
                accessibilityLabel="Invite code, optional"
              />
              <Ionicons
                name="gift-outline"
                size={20}
                color={theme.colors.ink3}
                style={tw`absolute left-4 top-4`}
              />
            </View>
            <Text style={tw`text-xs text-ink-3 mt-1.5`}>
              You’ll be friends with whoever invited you.
            </Text>
          </View>
        ) : (
          <PressableScale
            onPress={() => {
              animateNextLayout(reducedRef.current);
              setShowInvite(true);
            }}
            style={tw`self-start mb-3 py-1`}
            accessibilityRole="button"
            accessibilityLabel="Have an invite code?"
          >
            <Text style={tw`text-sm font-semibold text-emerald-700`}>Have an invite code?</Text>
          </PressableScale>
        )
      ) : null}

      <PrimaryButton
        label={isSignUp ? 'Create account' : 'Sign in'}
        onPress={() => void handleEmailAuth()}
        disabled={busy}
        loading={busy && !success}
        success={success}
      />

      {!isSignUp && featureFlags.showDemoAccounts ? (
        <View style={tw`mt-5 px-3.5 py-3 rounded-card bg-raised/80 border border-line/60`}>
          <Text style={tw`text-caption font-semibold tracking-widest text-ink-3 uppercase mb-2`}>
            Demo
          </Text>
          <Text style={tw`text-xs text-ink-3 mb-2.5`}>Password for all: GrowlDemo123!</Text>
          <View style={tw`flex-row gap-2`}>
            {DEMO_ACCOUNTS.map((item) => (
              <PressableScale
                key={item.email}
                disabled={busy}
                onPress={() => handleDemoSignIn(item.email)}
                accessibilityRole="button"
                accessibilityLabel={`Sign in as demo ${item.label}`}
                style={tw`flex-1 py-2 rounded-control bg-card border border-line/80 items-center ${
                  busy ? 'opacity-50' : ''
                }`}
              >
                <Text style={tw`text-xs font-bold text-emerald-800`}>{item.label}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );

  const socialRow = showSocialAuth ? (
    <View>
      <View style={tw`flex-row items-center my-7`}>
        <View style={tw`flex-1 h-px bg-line`} />
        <Text style={tw`mx-4 text-ink-3 text-sm`}>or continue with</Text>
        <View style={tw`flex-1 h-px bg-line`} />
      </View>

      {showApple && Platform.OS === 'ios' ? (
        <View
          pointerEvents={busy ? 'none' : 'auto'}
          style={[tw`mb-3`, busy ? tw`opacity-50` : null]}
          accessibilityState={{ disabled: busy }}
        >
          <AppleAuthentication.AppleAuthenticationButton
            // Native button type can't be changed in place; remount on mode switch.
            key={isSignUp ? 'apple-continue' : 'apple-sign-in'}
            buttonType={
              isSignUp
                ? AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              // Black on cream; white on the night palette (Apple HIG contrast).
              getColorSchemeName() === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={16}
            style={{ width: '100%', height: 50 }}
            onPress={() => void handleApple()}
          />
        </View>
      ) : null}

      {showGoogle || showFacebook ? (
        <View style={tw`flex-row gap-3 mb-2`}>
          {showGoogle ? (
            <PressableScale
              onPress={() => void handleGoogle()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
              accessibilityState={{ disabled: busy }}
              style={tw`flex-1 flex-row items-center justify-center border border-line/80 rounded-card py-3.5 bg-card ${
                busy ? 'opacity-50' : ''
              }`}
            >
              <Ionicons name="logo-google" size={20} color="#4285F4" />
              <Text style={tw`ml-2 font-semibold text-stone-800`}>Google</Text>
            </PressableScale>
          ) : null}
          {showFacebook ? (
            <PressableScale
              onPress={() => void handleFacebook()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Continue with Facebook"
              accessibilityState={{ disabled: busy }}
              style={tw`flex-1 flex-row items-center justify-center border border-line/80 rounded-card py-3.5 bg-card ${
                busy ? 'opacity-50' : ''
              }`}
            >
              <Ionicons name="logo-facebook" size={20} color="#1877F2" />
              <Text style={tw`ml-2 font-semibold text-stone-800`}>Facebook</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  ) : null;

  const body =
    step === 'forgot' ? forgotBody : step === 'reset' ? resetBody : step === 'verify' ? verifyBody : authBody;

  return (
    <Screen edges={['top', 'bottom']} background="page">
      <View style={tw`flex-1`}>
        <AuthAtmosphere />
        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={tw`flex-grow px-gutter-wide pt-2 pb-10`}
            showsVerticalScrollIndicator={false}
          >
            <View style={tw`max-w-md w-full self-center`}>
              {/* 1. Mark */}
              <Animated.View style={[tw`pt-6`, entranceStyle(entrance[0])]}>
                <View style={tw`flex-row items-center`}>
                  <Animated.View
                    style={{
                      transform: [
                        {
                          scale: markScale.interpolate({
                            inputRange: [0, 1],
                            outputRange: entranceStatic ? [1, 1] : [0.6, 1],
                          }),
                        },
                      ],
                    }}
                  >
                    <Image
                      source={require('../../../assets/icon.png')}
                      style={{ width: 52, height: 52, borderRadius: radius.control }}
                      accessibilityLabel="Grow! mark"
                    />
                  </Animated.View>
                  <Text
                    style={tw`ml-3 text-[36px] leading-[40px] tracking-[3px] uppercase text-emerald-700 font-bold`}
                    accessibilityRole="header"
                  >
                    Grow!
                  </Text>
                </View>
              </Animated.View>

              {/* 2. Title block (crossfades on mode/step change) */}
              <Animated.View style={[tw`mb-7`, entranceStyle(entrance[1])]}>
                <Animated.View
                  style={{ opacity: titleOpacity, transform: [{ translateY: titleRise }] }}
                  accessibilityLiveRegion="polite"
                >
                  <Text style={tw`text-xl font-semibold text-stone-800 mt-4`} accessibilityRole="header">
                    {shownCopy.title}
                  </Text>
                  <Text style={tw`text-sm text-ink-3 mt-2 leading-5`}>{shownCopy.subtitle}</Text>
                </Animated.View>
              </Animated.View>

              {/* Step content slides as a unit; form card + social row enter separately on mount. */}
              <Animated.View style={{ opacity: stepOpacity, transform: [{ translateX: stepX }] }}>
                {/* 3. Form card */}
                <Animated.View style={entranceStyle(entrance[2])}>
                  <Animated.View style={{ transform: [{ translateX: cardShake }] }}>{body}</Animated.View>
                </Animated.View>

                {/* 4. Social row */}
                {step === 'auth' && socialRow ? (
                  <Animated.View style={entranceStyle(entrance[3])}>{socialRow}</Animated.View>
                ) : null}
              </Animated.View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
}
