import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore doesn't work on web, so we use localStorage as fallback
const isWeb = Platform.OS === 'web';

export async function setSecureItem(key: string, value: string) {
  if (isWeb) {
    try {
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
      return localStorage.getItem(key);
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
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to delete item from localStorage:', error);
    }
  } else {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn('[SecureStore] Failed to delete item:', error);
    }
  }
}
