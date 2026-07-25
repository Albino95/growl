import { Platform, Share } from 'react-native';
import { alertMessage } from './confirmDialog';

/** Download or share CSV — blob on web, Share on native. */
export async function downloadCsv(filename: string, csv: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    alertMessage('Exported', `${filename} download started.`);
    return;
  }

  try {
    await Share.share({ message: csv, title: filename });
    alertMessage('Exported', 'CSV ready to save or share.');
  } catch {
    alertMessage('Exported', 'CSV generated successfully.');
  }
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
