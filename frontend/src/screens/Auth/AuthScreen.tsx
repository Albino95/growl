import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { useAuth } from '../../store/hooks';
import { validatePasswordStrength } from '../../utils/passwordPolicy';
import {
  isGoogleOAuthConfigured,
  isFacebookOAuthConfigured,
  signInWithGooglePrompt,
  signInWithFacebookPrompt,
} from '../../services/auth/oauth';
import tw from '../../lib/tw';

function notify(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
  } else if (Platform.OS !== 'web') {
    Alert.alert(title, message);
  }
}

type Step = 'auth' | 'verify';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [step, setStep] = useState<Step>('auth');
  const { signIn, signUp, verifyEmail, signInWithSSO, isLoading, error } = useAuth();
  const busy = localLoading || isLoading;

  const handleEmailAuth = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      notify('Missing fields', 'Please enter email and password.');
      return;
    }

    const pwCheck = validatePasswordStrength(password);
    if (isSignUp && !pwCheck.ok) {
      notify('Weak password', pwCheck.message);
      return;
    }

    setLocalLoading(true);
    try {
      if (isSignUp) {
        const result = await signUp(trimmedEmail, password).unwrap();
        setDevCodeHint(result.devVerificationCode ?? null);
        setStep('verify');
        notify('Verify your email', result.message);
      } else {
        await signIn(trimmedEmail, password).unwrap();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : error || 'Authentication failed';
      notify(isSignUp ? 'Sign up failed' : 'Sign in failed', msg);
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
    } catch (e: unknown) {
      notify('Facebook sign-in', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLocalLoading(false);
    }
  };

  if (step === 'verify') {
    return (
      <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top', 'bottom']}>
        <View style={tw`flex-1 px-5 pt-8 max-w-md w-full self-center`}>
          <Text style={tw`text-2xl font-bold text-stone-900 mb-2`}>Verify email</Text>
          <Text style={tw`text-stone-600 mb-6`}>
            Enter the 6-digit code sent to {email.trim().toLowerCase()}.
          </Text>
          {devCodeHint ? (
            <Text style={tw`text-xs text-amber-800 bg-amber-50 p-3 rounded-xl mb-4`}>
              Dev code: {devCodeHint}
            </Text>
          ) : null}
          <TextInput
            placeholder="123456"
            keyboardType="number-pad"
            value={verifyCode}
            onChangeText={setVerifyCode}
            maxLength={6}
            style={tw`border border-stone-200 bg-white rounded-2xl py-3.5 px-4 text-center text-xl tracking-widest mb-4`}
          />
          <PrimaryButton label="Confirm email" onPress={handleVerify} disabled={busy} />
          <TouchableOpacity onPress={() => setStep('auth')} style={tw`mt-6 items-center`}>
            <Text style={tw`text-emerald-700 font-semibold`}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={tw`flex-grow px-5 pt-4 pb-8`}
        >
          <View style={tw`max-w-md w-full self-center`}>
            <View style={tw`items-center mb-8`}>
              <View style={tw`w-16 h-16 rounded-2xl bg-emerald-600 items-center justify-center mb-4`}>
                <Text style={tw`text-white text-2xl font-bold`}>G</Text>
              </View>
              <Text style={tw`text-3xl font-bold text-stone-900`}>Growl</Text>
              <Text style={tw`text-base text-stone-500 mt-2 text-center`}>
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </Text>
            </View>

            <View style={tw`gap-3 mb-2`}>
              <View style={tw`relative`}>
                <TextInput
                  placeholder="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  style={tw`border border-stone-200 bg-white rounded-2xl py-3.5 pl-11 pr-4 text-base`}
                  placeholderTextColor="#A8A29E"
                />
                <Ionicons name="mail-outline" size={20} color="#78716C" style={tw`absolute left-4 top-4`} />
              </View>
              <View style={tw`relative`}>
                <TextInput
                  placeholder={isSignUp ? 'Password (12+ chars, mixed case, number, symbol)' : 'Password'}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoComplete={isSignUp ? 'password-new' : 'password'}
                  style={tw`border border-stone-200 bg-white rounded-2xl py-3.5 pl-11 pr-12 text-base`}
                  placeholderTextColor="#A8A29E"
                />
                <Ionicons name="lock-closed-outline" size={20} color="#78716C" style={tw`absolute left-4 top-4`} />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={tw`absolute right-3 top-3.5 p-1`}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#78716C" />
                </TouchableOpacity>
              </View>
            </View>

            {isSignUp ? (
              <Text style={tw`text-xs text-stone-500 mb-4`}>
                Passwords are hashed on the server (PBKDF2). We never store your plain password.
              </Text>
            ) : null}

            <PrimaryButton
              label={isSignUp ? 'Sign up' : 'Sign in'}
              onPress={handleEmailAuth}
              disabled={busy}
            />

            {busy ? <ActivityIndicator style={tw`mt-5`} color="#059669" /> : null}

            <View style={tw`flex-row items-center my-7`}>
              <View style={tw`flex-1 h-px bg-stone-200`} />
              <Text style={tw`mx-4 text-stone-400 text-sm`}>or</Text>
              <View style={tw`flex-1 h-px bg-stone-200`} />
            </View>

            <TouchableOpacity
              onPress={() => void handleGoogle()}
              disabled={busy}
              style={tw`flex-row items-center justify-center border border-stone-200 rounded-2xl p-3.5 bg-white mb-3`}
            >
              <Ionicons name="logo-google" size={22} color="#4285F4" style={tw`mr-2`} />
              <Text style={tw`text-base font-medium text-stone-800`}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => void handleFacebook()}
              disabled={busy}
              style={tw`flex-row items-center justify-center border border-stone-200 rounded-2xl p-3.5 bg-white`}
            >
              <Ionicons name="logo-facebook" size={22} color="#1877F2" style={tw`mr-2`} />
              <Text style={tw`text-base font-medium text-stone-800`}>Continue with Facebook</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={tw`mt-8 items-center`}>
              <Text style={tw`text-stone-600`}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={tw`text-emerald-700 font-semibold`}>{isSignUp ? 'Sign in' : 'Sign up'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
