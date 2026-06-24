import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { modalOverlay, modalPanel } from '../../lib/motion';
import { Button } from './Button';
import { Input } from './Input';

type PromptProps = {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function PromptDialog({
  open,
  title,
  message,
  placeholder,
  confirmLabel = 'Submit',
  loading,
  onConfirm,
  onCancel,
}: PromptProps) {
  const [value, setValue] = useState('');

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            variants={modalPanel}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
            <Input
              className="mt-4"
              placeholder={placeholder}
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm(value);
              }}
            />
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={onCancel} disabled={loading}>
                Cancel
              </Button>
              <Button loading={loading} onClick={() => onConfirm(value)}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

type ConfirmProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'primary',
  loading,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            variants={modalPanel}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm text-slate-600">{message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={onCancel} disabled={loading}>
                Cancel
              </Button>
              <Button variant={variant} loading={loading} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SlideOver({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
