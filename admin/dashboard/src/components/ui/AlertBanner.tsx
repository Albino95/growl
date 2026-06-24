import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';

export function AlertBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1">{message}</span>
        {onDismiss && (
          <button type="button" onClick={onDismiss} className="text-red-600 hover:text-red-800">
            <X className="h-4 w-4" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
    >
      {message}
    </motion.div>
  );
}
