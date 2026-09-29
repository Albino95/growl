import { showAppAlert, showAppConfirm } from '../components/ui/AppDialog';

/** Cross-platform confirm via branded AppDialog (works on web + native). */
export function confirmAsync(
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean }
): Promise<boolean> {
  return showAppConfirm(title, message, options);
}

export function alertMessage(title: string, message?: string): Promise<void> {
  const body =
    typeof message === 'string' && message.trim()
      ? message.trim()
      : 'Something went wrong. Please try again.';
  return showAppAlert(title, body);
}
