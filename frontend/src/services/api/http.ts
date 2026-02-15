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
