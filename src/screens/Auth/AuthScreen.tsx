import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { useAuthStore } from '../../state/useAuthStore';
import tw from '../../lib/tw';

export default function AuthScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const { signIn, signInWithSSO } = useAuthStore();

  const handleEmailAuth = async () => {
    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }
    setIsLoading(true);
    try {
      await signIn(email, password);
      // Navigation will be handled by RootNavigator based on auth state
    } catch (error) {
      alert('Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSSO = async (provider: 'google' | 'facebook') => {
    setIsLoading(true);
    try {
      // In a real app, you'd use expo-auth-session here
      // For now, using a mock token
      const mockToken = `sso-${provider}-token-${Date.now()}`;
      await signInWithSSO(provider, mockToken);
    } catch (error) {
      alert(`${provider} authentication failed. Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`flex-1 items-center justify-center p-6 w-full`}>
        <View style={tw`items-center mb-8`}>
          <Text style={tw`text-4xl font-bold mb-2 text-green-600`}>Grow!</Text>
          <Text style={tw`text-base text-gray-600 text-center`}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Text>
        </View>

        <View style={tw`w-full gap-3 mb-6`}>
          <View style={tw`relative`}>
            <TextInput
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={tw`border border-gray-300 rounded-xl p-3 pl-10 text-base`}
            />
            <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={tw`absolute left-3 top-3.5`} />
          </View>
          <View style={tw`relative`}>
            <TextInput
              placeholder="Password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={tw`border border-gray-300 rounded-xl p-3 pl-10 text-base`}
            />
            <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={tw`absolute left-3 top-3.5`} />
          </View>
        </View>

        <PrimaryButton
          label={isSignUp ? 'Sign Up' : 'Sign In'}
          onPress={handleEmailAuth}
          disabled={isLoading}
        />

        {isLoading && <ActivityIndicator style={tw`mt-4`} />}

        <View style={tw`flex-row items-center my-6 w-full`}>
          <View style={tw`flex-1 h-px bg-gray-300`} />
          <Text style={tw`mx-4 text-gray-500`}>OR</Text>
          <View style={tw`flex-1 h-px bg-gray-300`} />
        </View>

        <View style={tw`w-full gap-3 mb-4`}>
          <TouchableOpacity
            onPress={() => handleSSO('google')}
            disabled={isLoading}
            style={tw`flex-row items-center justify-center border border-gray-300 rounded-xl p-3 bg-white`}
          >
            <Ionicons name="logo-google" size={20} color="#4285F4" style={tw`mr-2`} />
            <Text style={tw`text-base font-medium`}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleSSO('facebook')}
            disabled={isLoading}
            style={tw`flex-row items-center justify-center border border-gray-300 rounded-xl p-3 bg-white`}
          >
            <Ionicons name="logo-facebook" size={20} color="#1877F2" style={tw`mr-2`} />
            <Text style={tw`text-base font-medium`}>Continue with Facebook</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)} style={tw`mt-4`}>
          <Text style={tw`text-gray-600`}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={tw`text-green-600 font-semibold`}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
