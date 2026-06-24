import Constants from 'expo-constants';
import { getSecureItem } from '../storage/secureStore';
import { getToken } from '../storage/tokenManager';
import { messageFromApiError } from './apiErrors';

const BASE_URL: string = (Constants?.expoConfig?.extra?.API_BASE_URL as string) || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;

  // Get auth token - try memory cache first, then secure storage fallback.
  let token: string | null = getToken();

  if (!token) {
    try {
      token = await getSecureItem('auth_token');
      if (token) {
        const { setToken } = await import('../storage/tokenManager');
        setToken(token);
      }
    } catch (error) {
      console.warn('[HTTP] Could not load auth token from secure storage:', error);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();

    // Check if backend returned an error in the response body
    if (!res.ok || (data && data.success === false)) {
      throw new Error(messageFromApiError(data, res.status));
    }

    if (res.status === 204) return undefined as unknown as T;
    return data as T;
  } catch (error: unknown) {
    // Re-throw with better error message
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network request failed');
  }
}
