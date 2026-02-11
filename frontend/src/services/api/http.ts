import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const BASE_URL: string = (Constants?.expoConfig?.extra?.API_BASE_URL as string) || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  
  // Get auth token if available
  const token = await SecureStore.getItemAsync('auth_token');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errorText}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}
