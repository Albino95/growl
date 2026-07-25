import { Alert, Platform } from 'react-native';

/** Cross-platform confirm — Alert.alert is a no-op on web. */
export function confirmAsync(
  title: string,
  message: string,
  options?: { confirmLabel?: string; destructive?: boolean }
): Promise<boolean> {
  const confirmLabel = options?.confirmLabel ?? 'OK';

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: options?.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}

export function alertMessage(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
