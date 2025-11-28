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
      // The RootNavigator will automatically navigate based on token/user state
    } catch (error) {
      console.error('Sign in error:', error);
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

        {/* Demo Credentials Info */}
        <View style={tw`w-full mb-4`}>
          <Text style={tw`text-sm font-semibold text-gray-700 mb-2 text-center`}>Demo Accounts:</Text>
          
          {/* Regular User */}
          <TouchableOpacity
            onPress={() => {
              setEmail('demo@growl.app');
              setPassword('demo123');
            }}
            style={tw`p-3 bg-blue-50 border border-blue-200 rounded-xl mb-2`}
          >
            <Text style={tw`text-xs font-semibold text-blue-900 mb-1`}>👤 Regular User</Text>
            <Text style={tw`text-xs text-blue-700`}>demo@growl.app / demo123</Text>
          </TouchableOpacity>

          {/* Instructor */}
          <TouchableOpacity
            onPress={() => {
              setEmail('instructor@growl.app');
              setPassword('instructor123');
            }}
            style={tw`p-3 bg-purple-50 border border-purple-200 rounded-xl mb-2`}
          >
            <Text style={tw`text-xs font-semibold text-purple-900 mb-1`}>🎓 Instructor</Text>
            <Text style={tw`text-xs text-purple-700`}>instructor@growl.app / instructor123</Text>
          </TouchableOpacity>

          {/* Business */}
          <TouchableOpacity
            onPress={() => {
              setEmail('business@growl.app');
              setPassword('business123');
            }}
            style={tw`p-3 bg-green-50 border border-green-200 rounded-xl`}
          >
            <Text style={tw`text-xs font-semibold text-green-900 mb-1`}>🏪 Business</Text>
            <Text style={tw`text-xs text-green-700`}>business@growl.app / business123</Text>
          </TouchableOpacity>
        </View>

        <View style={tw`w-full gap-3 mb-4`}>
          <TouchableOpacity
            onPress={() => handleSSO('google')}
            disabled={isLoading}
            style={tw`flex-row items-center justify-center border border-gray-300 rounded-xl p-3 bg-white shadow-sm`}
          >
            {/* Google Logo - Simplified multi-color design */}
            <View style={tw`w-6 h-6 mr-2 relative overflow-hidden rounded-sm`}>
              {/* White background */}
              <View style={tw`absolute inset-0 bg-white`} />
              {/* Blue section (top-left quadrant) */}
              <View style={tw`absolute top-0 left-0 w-3 h-3 bg-blue-500 rounded-tl-sm`} />
              {/* Red circle (top-right) */}
              <View style={tw`absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full`} />
              {/* Yellow circle (bottom-left) */}
              <View style={tw`absolute bottom-1 left-1 w-1.5 h-1.5 bg-yellow-500 rounded-full`} />
              {/* Green circle (bottom-right) */}
              <View style={tw`absolute bottom-0.5 right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full`} />
            </View>
            <Text style={tw`text-base font-medium text-gray-700`}>Continue with Google</Text>
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
