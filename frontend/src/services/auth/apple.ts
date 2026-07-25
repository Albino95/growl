import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

export function isAppleSignInAvailable(): boolean {
  return Platform.OS === 'ios';
}

/** Returns Apple identity token for POST /auth/sso with provider apple */
export async function signInWithApplePrompt(): Promise<string> {
  if (!isAppleSignInAvailable()) {
    throw new Error('Sign in with Apple is only available on iOS');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Sign in with Apple is not available on this device');
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token');
  }

  return credential.identityToken;
}
