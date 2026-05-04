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
import tw from '../../lib/tw';

function notify(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
  } else if (Platform.OS !== 'web') {
    Alert.alert(title, message);
  } else {
    console.warn(title, message);
  }
}

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { signIn, signInWithSSO, isLoading: authLoading } = useAuth();
  const isLoading = localLoading || authLoading;

  const handleEmailAuth = async () => {
    if (!email.trim() || !password) {
      notify('Missing fields', 'Please enter email and password.');
      return;
    }
    setLocalLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      console.error('Sign in error:', error);
      notify('Sign in failed', 'Check your credentials and try again.');
    } finally {
      setLocalLoading(false);
    }
  };

  const handleSSO = async (provider: 'google' | 'facebook') => {
    setLocalLoading(true);
    try {
      const mockToken = `sso-${provider}-token-${Date.now()}`;
      await signInWithSSO(provider, mockToken);
    } catch (error) {
      notify(`${provider} sign-in`, 'Could not complete. Try email sign-in for now.');
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-stone-50`} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={tw`flex-1`}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={tw`flex-grow px-5 pt-4 pb-8`}
          showsVerticalScrollIndicator={false}
        >
          <View style={tw`max-w-md w-full self-center`}>
            <View style={tw`items-center mb-8`}>
              <View style={tw`w-16 h-16 rounded-2xl bg-emerald-600 items-center justify-center mb-4 shadow-sm`}>
                <Text style={tw`text-white text-2xl font-bold`}>G</Text>
              </View>
              <Text style={tw`text-3xl font-bold text-stone-900`}>Growl</Text>
              <Text style={tw`text-base text-stone-500 mt-2 text-center`}>
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </Text>
            </View>

            <View style={tw`gap-3 mb-5`}>
              <View style={tw`relative`}>
                <TextInput
                  placeholder="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  value={email}
                  onChangeText={setEmail}
                  style={tw`border border-stone-200 bg-white rounded-2xl py-3.5 pl-11 pr-4 text-base text-stone-900`}
                  placeholderTextColor="#A8A29E"
                />
                <Ionicons name="mail-outline" size={20} color="#78716C" style={tw`absolute left-4 top-4`} />
              </View>
              <View style={tw`relative`}>
                <TextInput
                  placeholder="Password"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  autoComplete="password"
                  textContentType="password"
                  style={tw`border border-stone-200 bg-white rounded-2xl py-3.5 pl-11 pr-12 text-base text-stone-900`}
                  placeholderTextColor="#A8A29E"
                />
                <Ionicons name="lock-closed-outline" size={20} color="#78716C" style={tw`absolute left-4 top-4`} />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={tw`absolute right-3 top-3.5 p-1`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#78716C" />
                </TouchableOpacity>
              </View>
            </View>

            <PrimaryButton
              label={isSignUp ? 'Sign up' : 'Sign in'}
              onPress={handleEmailAuth}
              disabled={isLoading}
            />

            {isLoading ? <ActivityIndicator style={tw`mt-5`} color="#059669" /> : null}

            <View style={tw`flex-row items-center my-7`}>
              <View style={tw`flex-1 h-px bg-stone-200`} />
              <Text style={tw`mx-4 text-stone-400 text-sm font-medium`}>or</Text>
              <View style={tw`flex-1 h-px bg-stone-200`} />
            </View>

            <Text style={tw`text-xs font-semibold text-stone-600 mb-2 text-center`}>Quick demo accounts</Text>

            <TouchableOpacity
              onPress={() => {
                setEmail('demo@growl.app');
                setPassword('demo123');
              }}
              style={tw`p-3 bg-white border border-stone-200 rounded-2xl mb-2`}
            >
              <Text style={tw`text-xs font-semibold text-stone-800`}>Regular</Text>
              <Text style={tw`text-xs text-stone-500 mt-0.5`}>demo@growl.app · demo123</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setEmail('instructor@growl.app');
                setPassword('instructor123');
              }}
              style={tw`p-3 bg-white border border-violet-100 rounded-2xl mb-2`}
            >
              <Text style={tw`text-xs font-semibold text-violet-900`}>Instructor</Text>
              <Text style={tw`text-xs text-violet-700 mt-0.5`}>instructor@growl.app · instructor123</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setEmail('business@growl.app');
                setPassword('business123');
              }}
              style={tw`p-3 bg-white border border-emerald-100 rounded-2xl mb-5`}
            >
              <Text style={tw`text-xs font-semibold text-emerald-900`}>Business</Text>
              <Text style={tw`text-xs text-emerald-700 mt-0.5`}>business@growl.app · business123</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSSO('google')}
              disabled={isLoading}
              style={tw`flex-row items-center justify-center border border-stone-200 rounded-2xl p-3.5 bg-white mb-3`}
            >
              <Ionicons name="logo-google" size={22} color="#4285F4" style={tw`mr-2`} />
              <Text style={tw`text-base font-medium text-stone-800`}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => handleSSO('facebook')}
              disabled={isLoading}
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
