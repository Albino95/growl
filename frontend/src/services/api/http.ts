import Constants from 'expo-constants';
import { getSecureItem } from '../storage/secureStore';

const BASE_URL: string = (Constants?.expoConfig?.extra?.API_BASE_URL as string) || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  
  // Get auth token if available - use wrapper that handles web gracefully
  let token: string | null = null;
  try {
    token = await getSecureItem('auth_token');
  } catch (error) {
    // SecureStore might not be available on web, that's okay
    console.warn('[HTTP] Could not get auth token from SecureStore:', error);
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    
    // Check if backend returned an error in the response body
    if (!res.ok || (data && data.success === false)) {
      const errorMessage = data?.error?.message || data?.error?.code || `HTTP ${res.status}`;
      throw new Error(errorMessage);
    }
    
    if (res.status === 204) return undefined as unknown as T;
    return data as T;
  } catch (error: any) {
    // Re-throw with better error message
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(error?.message || 'Network request failed');
  }
}
