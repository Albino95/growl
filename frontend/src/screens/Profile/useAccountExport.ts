import { useCallback, useRef, useState } from 'react';
import { exportAccountData } from '../../services/api/privacy';
import { alertMessage } from '../../utils/confirmDialog';

/**
 * "Export my data" — shared by Privacy & safety and Delete account.
 * Requests the server-side export and tells the user what was gathered.
 */
export function useAccountExport() {
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);

  const runExport = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setExporting(true);
    try {
      const data = await exportAccountData();
      const summary = `Exported ${data.posts.length} posts, ${data.comments.length} comments, ${data.orders.length} orders.`;
      void alertMessage(
        'Export ready',
        `${summary}\n\nA copy has been prepared on the server. Contact privacy@letsgrow.lu for a full archive file.`,
      );
    } catch (e: unknown) {
      void alertMessage('Export failed', e instanceof Error ? e.message : 'Could not export data');
    } finally {
      busy.current = false;
      setExporting(false);
    }
  }, []);

  return { exporting, runExport };
}
