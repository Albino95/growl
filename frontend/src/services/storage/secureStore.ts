import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore doesn't work on web; use sessionStorage (not localStorage) as fallback.
const isWeb = Platform.OS === 'web';

export async function setSecureItem(key: string, value: string) {
  if (isWeb) {
    try {
      localStorage.removeItem(key);
      sessionStorage.setItem(key, value);
    } catch (error) {
      console.warn('[SecureStore] Failed to set item in sessionStorage:', error);
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
      localStorage.removeItem(key);
      return sessionStorage.getItem(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to get item from sessionStorage:', error);
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
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to delete item from sessionStorage:', error);
    }
  } else {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to delete item:', error);
    }
  }
}
