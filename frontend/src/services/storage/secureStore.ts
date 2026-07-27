import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Web: persist in localStorage so sessions survive tab reloads / backgrounding.
// (sessionStorage was clearing too aggressively and felt like random logouts.)
const isWeb = Platform.OS === 'web';

export async function setSecureItem(key: string, value: string) {
  if (isWeb) {
    try {
      sessionStorage.removeItem(key);
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('[SecureStore] Failed to set item in localStorage:', error);
    }
  } else {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.warn('[SecureStore] Failed to set item:', error);
    }
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (isWeb) {
    try {
      const fromLocal = localStorage.getItem(key);
      if (fromLocal) return fromLocal;
      // Migrate any leftover sessionStorage tokens once
      const fromSession = sessionStorage.getItem(key);
      if (fromSession) {
        localStorage.setItem(key, fromSession);
        sessionStorage.removeItem(key);
        return fromSession;
      }
      return null;
    } catch (error) {
      console.warn('[SecureStore] Failed to get item from localStorage:', error);
      return null;
    }
  } else {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to get item:', error);
      return null;
    }
  }
}

export async function deleteSecureItem(key: string) {
  if (isWeb) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to delete item from storage:', error);
    }
  } else {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to delete item:', error);
    }
  }
}
