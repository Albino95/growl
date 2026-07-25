import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

function extra(key: string): string | undefined {
  const v = Constants.expoConfig?.extra?.[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** OAuth redirect URI using the app scheme (growl://) for native builds. */
export function getOAuthRedirectUri(): string {
  return makeRedirectUri({ scheme: 'growl', path: 'oauth' });
}

export function isGoogleOAuthConfigured(): boolean {
  return !!(extra('googleWebClientId') || extra('googleIosClientId') || extra('googleAndroidClientId'));
}

export function isFacebookOAuthConfigured(): boolean {
  return !!extra('facebookAppId');
}

/** Run Google OAuth; returns ID token for POST /auth/sso */
export async function signInWithGooglePrompt(): Promise<string> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error(
      'Google sign-in is not configured. Add googleWebClientId (and platform IDs) to app.config.ts extra.'
    );
  }

  const redirectUri = getOAuthRedirectUri();

  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
  };

  const clientId = extra('googleWebClientId')!;

  const authUrl =
    `${discovery.authorizationEndpoint}?` +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: String(Date.now()),
    }).toString();

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type !== 'success' || !result.url) {
    throw new Error('Google sign-in was cancelled');
  }

  const hash = result.url.split('#')[1] || '';
  const params = new URLSearchParams(hash);
  const idToken = params.get('id_token');
  if (!idToken) {
    throw new Error('Google did not return an ID token');
  }
  return idToken;
}

/** Run Facebook OAuth; returns access token for POST /auth/sso */
export async function signInWithFacebookPrompt(): Promise<string> {
  const appId = extra('facebookAppId');
  if (!appId) {
    throw new Error('Facebook sign-in is not configured. Add facebookAppId to app.config.ts extra.');
  }

  const redirectUri = getOAuthRedirectUri();
  const authUrl =
    `https://www.facebook.com/v18.0/dialog/oauth?` +
    new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: 'email,public_profile',
    }).toString();

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Facebook sign-in was cancelled');
  }

  const hash = result.url.split('#')[1] || '';
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) {
    throw new Error('Facebook did not return an access token');
  }
  return accessToken;
}
