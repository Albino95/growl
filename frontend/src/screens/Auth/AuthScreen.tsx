import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Screen from '../../components/ui/Screen';
import SectionLabel from '../../components/ui/SectionLabel';
import PrimaryButton from '../../components/ui/PrimaryButton';
import GrowChromeHeader from '../../components/ui/GrowChromeHeader';
import { useAuth } from '../../store/hooks';
import { validatePasswordStrength } from '../../utils/passwordPolicy';
import {
  isGoogleOAuthConfigured,
  isFacebookOAuthConfigured,
  signInWithGooglePrompt,
  signInWithFacebookPrompt,
} from '../../services/auth/oauth';
import { isAppleSignInAvailable, signInWithApplePrompt } from '../../services/auth/apple';
import { DEMO_ACCOUNTS, DEMO_ACCOUNT_PASSWORD } from '../../constants/demoAccounts';
import { featureFlags } from '../../constants/featureFlags';
import {
  forgotPasswordApi,
  resetPasswordApi,
} from '../../services/api/auth';
import tw from '../../lib/tw';

function notify(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
  } else if (Platform.OS !== 'web') {
    Alert.alert(title, message);
  }
}

type Step = 'auth' | 'verify' | 'forgot' | 'reset';

const PASSWORD_RULES = [
  { key: 'len', label: '12+ characters', test: (p: string) => p.length >= 12 },
  { key: 'upper', label: 'Uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { key: 'num', label: 'Number', test: (p: string) => /[0-9]/.test(p) },
  { key: 'sym', label: 'Symbol', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

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
          tw`absolute rounded-full bg-[#EAE4D6]`,
          { width: 220, height: 220, top: 180, left: -110, opacity: 0.7 },
        ]}
      />
      <View
        style={[
          tw`absolute rounded-full bg-emerald-500/8`,
          { width: 160, height: 160, bottom: 120, right: -40 },
        ]}
      />
    </View>
  );
}

function AuthBrandBlock({
  title,
  subtitle,
  fade,
  rise,
}: {
  title: string;
  subtitle: string;
  fade: Animated.Value;
  rise: Animated.Value;
}) {
  return (
    <Animated.View
      style={[
        tw`mb-7 pt-4`,
        {
          opacity: fade,
          transform: [
            {
              translateY: rise.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={tw`text-[42px] leading-[46px] tracking-[3px] uppercase text-emerald-700 font-bold`}>
        Grow!
      </Text>
      <Text style={tw`text-xl font-semibold text-stone-800 mt-4`}>{title}</Text>
      <Text style={tw`text-sm text-stone-500 mt-2 leading-5`}>{subtitle}</Text>
    </Animated.View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={tw`text-[11px] font-semibold tracking-widest text-stone-500 uppercase mb-1.5 ml-0.5`}>
      {children}
    </Text>
  );
}

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [devResetHint, setDevResetHint] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [step, setStep] = useState<Step>('auth');
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

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;
  const formFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    rise.setValue(0);
    formFade.setValue(0);
    Animated.stagger(80, [
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(rise, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
      Animated.timing(formFade, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [step, isSignUp, fade, rise, formFade]);

  const passwordRuleStatus = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(password) })),
    [password]
  );

  const handleEmailAuth = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    setEmailError(null);
    setPasswordError(null);
    if (!trimmedEmail || !password) {
      if (!trimmedEmail) setEmailError('Email is required.');
      if (!password) setPasswordError('Password is required.');
      notify('Missing fields', 'Please enter email and password.');
      return;
    }

    const pwCheck = validatePasswordStrength(password);
    if (isSignUp && !pwCheck.ok) {
      setPasswordError(pwCheck.message);
      notify('Weak password', pwCheck.message);
      return;
    }

    setLocalLoading(true);
    try {
      if (isSignUp) {
        const result = await signUp(trimmedEmail, password).unwrap();
        markSignupOnboardingRequired();
        setDevCodeHint(result.devVerificationCode ?? null);
        setStep('verify');
        setPassword('');
        notify('Verify your email', result.message);
      } else {
        await signIn(trimmedEmail, password).unwrap();
        void refreshProfile();
      }
    } catch (e: unknown) {
      const msg =
        typeof e === 'string'
          ? e
          : e instanceof Error
            ? e.message
            : error || 'Authentication failed';
      const alreadyExists =
        isSignUp && typeof msg === 'string' && msg.toLowerCase().includes('already exists');
      if (alreadyExists) {
        setIsSignUp(false);
        notify('Account exists', `${msg}\n\nSwitched to sign in — use your password.`);
      } else {
        notify(isSignUp ? 'Sign up failed' : 'Sign in failed', msg);
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!verifyCode.trim()) {
      notify('Code required', 'Enter the 6-digit code from your email.');
      return;
    }
    setLocalLoading(true);
    try {
      await verifyEmail(email.trim().toLowerCase(), verifyCode.trim()).unwrap();
      notify('Email verified', 'You can sign in now.');
      setStep('auth');
      setIsSignUp(false);
      setVerifyCode('');
    } catch (e: unknown) {
      notify('Verification failed', e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setLocalLoading(false);
    }
  };

  const fillDemoAndSignIn = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword(DEMO_ACCOUNT_PASSWORD);
    setIsSignUp(false);
    setLocalLoading(true);
    try {
      await signIn(demoEmail, DEMO_ACCOUNT_PASSWORD).unwrap();
      void refreshProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Demo sign-in failed';
      notify('Demo account unavailable', `${msg}\n\nRun: cd backend && npm run demo:local`);
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (!isGoogleOAuthConfigured()) {
      notify(
        'Google not configured',
        'Add googleWebClientId to app.config.ts extra, then rebuild the app.'
      );
      return;
    }
    setLocalLoading(true);
    try {
      const idToken = await signInWithGooglePrompt();
      await signInWithSSO({ provider: 'google', idToken }).unwrap();
      void refreshProfile();
    } catch (e: unknown) {
      notify('Google sign-in', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleFacebook = async () => {
    if (!isFacebookOAuthConfigured()) {
      notify('Facebook not configured', 'Add facebookAppId to app.config.ts extra, then rebuild.');
      return;
    }
    setLocalLoading(true);
    try {
      const accessToken = await signInWithFacebookPrompt();
      await signInWithSSO({ provider: 'facebook', accessToken }).unwrap();
      void refreshProfile();
    } catch (e: unknown) {
      notify('Facebook sign-in', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleApple = async () => {
    setLocalLoading(true);
    try {
      const idToken = await signInWithApplePrompt();
      await signInWithSSO({ provider: 'apple', idToken }).unwrap();
      void refreshProfile();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed';
      if (!msg.toLowerCase().includes('cancel')) {
        notify('Apple sign-in', msg);
      }
    } finally {
      setLocalLoading(false);
    }
  };

  const handleForgotRequest = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError('Email is required.');
      notify('Email required', 'Enter the email for your account.');
      return;
    }
    setLocalLoading(true);
    try {
      const result = await forgotPasswordApi(trimmedEmail);
      setDevResetHint(result.devResetCode ?? null);
      setStep('reset');
      notify('Check your email', result.message);
    } catch (e: unknown) {
      notify('Reset failed', e instanceof Error ? e.message : 'Could not start password reset');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!resetCode.trim()) {
      notify('Code required', 'Enter the reset code from your email.');
      return;
    }
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.ok) {
      setPasswordError(pwCheck.message);
      notify('Weak password', pwCheck.message);
      return;
    }
    setLocalLoading(true);
    try {
      await resetPasswordApi({
        email: trimmedEmail,
        code: resetCode.trim(),
        password,
      });
      notify('Password updated', 'Sign in with your new password.');
      setStep('auth');
      setIsSignUp(false);
      setResetCode('');
      setPassword('');
      setDevResetHint(null);
    } catch (e: unknown) {
      notify('Reset failed', e instanceof Error ? e.message : 'Invalid code or password');
    } finally {
      setLocalLoading(false);
    }
  };

  const shell = (body: React.ReactNode) => (
    <Screen edges={['top', 'bottom']} background="page">
      <View style={tw`flex-1`}>
        <AuthAtmosphere />
        <GrowChromeHeader />
        <KeyboardAvoidingView
          style={tw`flex-1`}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={tw`flex-grow px-5 pt-2 pb-10`}
            showsVerticalScrollIndicator={false}
          >
            <View style={tw`max-w-md w-full self-center`}>{body}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );

  if (step === 'forgot') {
    return shell(
      <>
        <AuthBrandBlock
          title="Reset password"
          subtitle="We'll email you a code to get back into your account."
          fade={fade}
          rise={rise}
        />
        <Animated.View style={{ opacity: formFade }}>
          <FieldLabel>Email</FieldLabel>
          <TextInput
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            style={tw`border border-stone-200/80 bg-[#FFFcf7] rounded-2xl py-3.5 px-4 text-base text-stone-900 mb-5`}
            placeholderTextColor="#A8A29E"
            accessibilityLabel="Email for password reset"
          />
          <PrimaryButton
            label="Send reset code"
            onPress={handleForgotRequest}
            disabled={busy}
            loading={busy}
          />
          <TouchableOpacity onPress={() => setStep('auth')} style={tw`mt-6 items-center`}>
            <Text style={tw`text-emerald-700 font-semibold`}>Back to sign in</Text>
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  }

  if (step === 'reset') {
    return shell(
      <>
        <AuthBrandBlock
          title="Choose a new password"
          subtitle="Enter the code from your email, then set something strong."
          fade={fade}
          rise={rise}
        />
        <Animated.View style={{ opacity: formFade }}>
          {featureFlags.showDevVerificationHint && devResetHint ? (
            <Text style={tw`text-xs text-amber-900 bg-amber-50 border border-amber-100 p-3 rounded-2xl mb-4`}>
              Dev reset code: {devResetHint}
            </Text>
          ) : null}
          <FieldLabel>Reset code</FieldLabel>
          <TextInput
            placeholder="123456"
            keyboardType="number-pad"
            value={resetCode}
            onChangeText={setResetCode}
            maxLength={6}
            style={tw`border border-stone-200/80 bg-[#FFFcf7] rounded-2xl py-4 px-4 text-center text-2xl tracking-widest mb-4 text-stone-900`}
            placeholderTextColor="#A8A29E"
            accessibilityLabel="Password reset code"
          />
          <FieldLabel>New password</FieldLabel>
          <TextInput
            placeholder="Create a strong password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            autoComplete="password-new"
            style={tw`border border-stone-200/80 bg-[#FFFcf7] rounded-2xl py-3.5 px-4 text-base text-stone-900 mb-3`}
            placeholderTextColor="#A8A29E"
            accessibilityLabel="New password"
          />
          {password.length > 0 ? (
            <View style={tw`mb-4 bg-[#EAE4D6]/70 border border-stone-200/60 rounded-2xl p-3`}>
              {passwordRuleStatus.map((rule) => (
                <View key={rule.key} style={tw`flex-row items-center py-1`}>
                  <Ionicons
                    name={rule.ok ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={rule.ok ? '#059669' : '#A8A29E'}
                  />
                  <Text style={tw`ml-2 text-xs ${rule.ok ? 'text-emerald-700' : 'text-stone-500'}`}>
                    {rule.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <PrimaryButton
            label="Update password"
            onPress={handleResetPassword}
            disabled={busy}
            loading={busy}
          />
          <TouchableOpacity onPress={() => setStep('forgot')} style={tw`mt-6 items-center`}>
            <Text style={tw`text-emerald-700 font-semibold`}>Resend code</Text>
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  }

  if (step === 'verify') {
    return shell(
      <>
        <AuthBrandBlock
          title="Confirm your email"
          subtitle="One quick step — then you're in."
          fade={fade}
          rise={rise}
        />
        <Animated.View style={{ opacity: formFade }}>
          <Text style={tw`text-stone-600 mb-5 leading-5`}>
            We sent a 6-digit code to{' '}
            <Text style={tw`font-semibold text-stone-800`}>{email.trim().toLowerCase()}</Text>
          </Text>
          {featureFlags.showDevVerificationHint && devCodeHint ? (
            <Text style={tw`text-xs text-amber-900 bg-amber-50 border border-amber-100 p-3 rounded-2xl mb-4`}>
              Dev code: {devCodeHint}
            </Text>
          ) : null}
          <FieldLabel>Verification code</FieldLabel>
          <TextInput
            placeholder="123456"
            keyboardType="number-pad"
            value={verifyCode}
            onChangeText={setVerifyCode}
            maxLength={6}
            style={tw`border border-stone-200/80 bg-[#FFFcf7] rounded-2xl py-4 px-4 text-center text-2xl tracking-widest mb-5 text-stone-900`}
            placeholderTextColor="#A8A29E"
          />
          <PrimaryButton label="Confirm email" onPress={handleVerify} disabled={busy} loading={busy} />
          <TouchableOpacity onPress={() => setStep('auth')} style={tw`mt-6 items-center`}>
            <Text style={tw`text-emerald-700 font-semibold`}>Back to sign in</Text>
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  }

  return shell(
    <>
      <AuthBrandBlock
        title={isSignUp ? 'Start growing' : 'Welcome back'}
        subtitle={
          isSignUp
            ? 'Join as a member. Instructors are earned by peers — not purchased.'
            : 'Pick up where you left off with your circle.'
        }
        fade={fade}
        rise={rise}
      />

      <Animated.View style={{ opacity: formFade }}>
        <View style={tw`flex-row mb-5 bg-[#EAE4D6]/80 p-1 rounded-2xl border border-stone-200/60`}>
          <TouchableOpacity
            onPress={() => setIsSignUp(false)}
            style={tw`flex-1 py-2.5 rounded-xl items-center ${!isSignUp ? 'bg-[#FFFcf7]' : ''}`}
          >
            <Text style={tw`font-semibold ${!isSignUp ? 'text-emerald-700' : 'text-stone-500'}`}>
              Sign in
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsSignUp(true)}
            style={tw`flex-1 py-2.5 rounded-xl items-center ${isSignUp ? 'bg-[#FFFcf7]' : ''}`}
          >
            <Text style={tw`font-semibold ${isSignUp ? 'text-emerald-700' : 'text-stone-500'}`}>
              Sign up
            </Text>
          </TouchableOpacity>
        </View>

        <View style={tw`gap-3 mb-2`}>
          <View>
            <FieldLabel>Email</FieldLabel>
            <View style={tw`relative`}>
              <TextInput
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (emailError) setEmailError(null);
                }}
                style={tw`border border-stone-200/80 bg-[#FFFcf7] rounded-2xl py-3.5 pl-11 pr-4 text-base text-stone-900`}
                placeholderTextColor="#A8A29E"
              />
              <Ionicons name="mail-outline" size={20} color="#78716C" style={tw`absolute left-4 top-4`} />
            </View>
            {emailError ? <Text style={tw`text-xs text-red-600 mt-1 ml-1`}>{emailError}</Text> : null}
          </View>

          <View>
            <FieldLabel>Password</FieldLabel>
            <View style={tw`relative`}>
              <TextInput
                placeholder={isSignUp ? 'Create a strong password' : 'Your password'}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (passwordError) setPasswordError(null);
                }}
                autoComplete={isSignUp ? 'password-new' : 'password'}
                style={tw`border border-stone-200/80 bg-[#FFFcf7] rounded-2xl py-3.5 pl-11 pr-12 text-base text-stone-900`}
                placeholderTextColor="#A8A29E"
              />
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#78716C"
                style={tw`absolute left-4 top-4`}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={tw`absolute right-3 top-3.5 p-1`}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color="#78716C"
                />
              </TouchableOpacity>
            </View>
            {passwordError ? (
              <Text style={tw`text-xs text-red-600 mt-1 ml-1`}>{passwordError}</Text>
            ) : null}
          </View>
        </View>

        {isSignUp && password.length > 0 ? (
          <View style={tw`mt-3 mb-4 bg-[#EAE4D6]/70 border border-stone-200/60 rounded-2xl p-3`}>
            {passwordRuleStatus.map((rule) => (
              <View key={rule.key} style={tw`flex-row items-center py-1`}>
                <Ionicons
                  name={rule.ok ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={rule.ok ? '#059669' : '#A8A29E'}
                />
                <Text style={tw`ml-2 text-xs ${rule.ok ? 'text-emerald-700' : 'text-stone-500'}`}>
                  {rule.label}
                </Text>
              </View>
            ))}
          </View>
        ) : isSignUp ? (
          <Text style={tw`text-xs text-stone-500 mb-4 mt-2`}>
            Use 12+ characters with upper, lower, number, and symbol.
          </Text>
        ) : (
          <TouchableOpacity
            onPress={() => setStep('forgot')}
            style={tw`self-end mb-3 mt-1`}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
          >
            <Text style={tw`text-sm font-semibold text-emerald-700`}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        <PrimaryButton
          label={isSignUp ? 'Create account' : 'Sign in'}
          onPress={handleEmailAuth}
          disabled={busy}
          loading={busy}
        />

        <View style={tw`flex-row items-center my-7`}>
          <View style={tw`flex-1 h-px bg-stone-200`} />
          <Text style={tw`mx-4 text-stone-400 text-sm`}>or continue with</Text>
          <View style={tw`flex-1 h-px bg-stone-200`} />
        </View>

        <View style={tw`flex-row gap-3 mb-2`}>
          {isAppleSignInAvailable() ? (
            <TouchableOpacity
              onPress={() => void handleApple()}
              disabled={busy}
              style={tw`flex-1 flex-row items-center justify-center border border-stone-800 rounded-2xl py-3.5 bg-stone-900`}
            >
              <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => void handleGoogle()}
            disabled={busy}
            style={tw`flex-1 flex-row items-center justify-center border border-stone-200/80 rounded-2xl py-3.5 bg-[#FFFcf7]`}
          >
            <Ionicons name="logo-google" size={22} color="#4285F4" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleFacebook()}
            disabled={busy}
            style={tw`flex-1 flex-row items-center justify-center border border-stone-200/80 rounded-2xl py-3.5 bg-[#FFFcf7]`}
          >
            <Ionicons name="logo-facebook" size={22} color="#1877F2" />
          </TouchableOpacity>
        </View>

        {featureFlags.showDemoAccounts ? (
          <View style={tw`mt-10 pt-6 border-t border-stone-200/80`}>
            <SectionLabel variant="caps">Demo accounts</SectionLabel>
            <Text style={tw`text-xs text-stone-400 mb-3`}>
              Password: {DEMO_ACCOUNT_PASSWORD} · seed with npm run demo:local
            </Text>
            <View style={tw`gap-2`}>
              {DEMO_ACCOUNTS.map((demo) => (
                <TouchableOpacity
                  key={demo.email}
                  onPress={() => void fillDemoAndSignIn(demo.email)}
                  disabled={busy}
                  style={tw`flex-row items-center border border-emerald-100 rounded-2xl px-3 py-3 bg-emerald-50/80`}
                >
                  <View style={tw`w-9 h-9 rounded-full bg-emerald-600 items-center justify-center mr-3`}>
                    <Text style={tw`text-white font-bold text-sm`}>{demo.label.charAt(0)}</Text>
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-sm font-semibold text-stone-800`}>{demo.label}</Text>
                    <Text style={tw`text-xs text-stone-500`}>{demo.email}</Text>
                  </View>
                  <Ionicons name="log-in-outline" size={20} color="#059669" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </Animated.View>
    </>
  );
}
