import Constants from 'expo-constants';
import { getSecureItem } from '../storage/secureStore';
import { getToken } from '../storage/tokenManager';
import { messageFromApiError } from './apiErrors';

const BASE_URL: string = (Constants?.expoConfig?.extra?.API_BASE_URL as string) || 'https://growl-backend.albino-ndreu.workers.dev/api/v1';

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${path}`;
  
  // Get auth token - try memory cache first, then SecureStore, then Redux store
  let token: string | null = getToken();
  
  if (!token) {
    try {
      token = await getSecureItem('auth_token');
      // Cache it in memory for next time
      if (token) {
        const { setToken } = await import('../storage/tokenManager');
        setToken(token);
        console.log('[HTTP] Token loaded from SecureStore and cached');
      }
    } catch (error) {
      // SecureStore might not be available on web, that's okay
      console.warn('[HTTP] Could not get auth token from SecureStore:', error);
    }
  }
  
  // Log token details for debugging (don't log full token for security)
  console.log('[HTTP] Request to:', path);
  console.log('[HTTP] Token available:', !!token);
  if (token) {
    console.log('[HTTP] Token preview:', token.substring(0, 20) + '...' + token.substring(token.length - 10));
    console.log('[HTTP] Token format:', token.split('.').length === 3 ? 'JWT format' : 'Invalid format');
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('[HTTP] Authorization header set');
  } else {
    console.warn('[HTTP] No token available - request will be unauthenticated');
  }
  
  try {
    console.log('[HTTP] Making request to:', url);
    console.log('[HTTP] Request headers:', { ...headers, Authorization: token ? 'Bearer ***' : 'none' });
    const res = await fetch(url, { ...options, headers });
    console.log('[HTTP] Response status:', res.status);
    const data = await res.json();
    console.log('[HTTP] Response data:', data);
    
    // Check if backend returned an error in the response body
    if (!res.ok || (data && data.success === false)) {
      throw new Error(messageFromApiError(data, res.status));
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
