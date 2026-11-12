import { Platform } from 'react-native';
import { alertMessage } from './confirmDialog';

function safeFilename(filename: string): string {
  const cleaned = filename.replace(/[^A-Za-z0-9._-]+/g, '_');
  return cleaned.toLowerCase().endsWith('.csv') ? cleaned : `${cleaned}.csv`;
}

/**
 * Download (web) or save + share (native) a CSV file.
 * Throws on failure so callers can show an honest "Export failed" message.
 */
export async function downloadCsv(filename: string, csv: string): Promise<void> {
  const name = safeFilename(filename);

  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Revoke on the next tick so the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
    alertMessage('Exported', `${name} download started.`);
    return;
  }

  const FileSystem = await import('expo-file-system/legacy');
  const Sharing = await import('expo-sharing');

  if (!FileSystem.cacheDirectory) {
    throw new Error('No writable storage is available on this device.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  // The share sheet is the confirmation; dismissing it is not an error.
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: name,
  });
}

/** Copy text to clipboard when available; otherwise show an alert. */
export async function copyToClipboard(text: string, label = 'Copied'): Promise<void> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      alertMessage(label, 'Copied to clipboard.');
      return;
    } catch {
      // fall through
    }
  }

  alertMessage(label, text);
}
