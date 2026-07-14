'use client';

import { useState } from 'react';
import { Modal } from '@/components/molecules/modal';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** What is about to happen and to what — be concrete, not apologetic. */
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
}

/** Confirmation dialog on the shared Modal; disables itself while confirming. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={pending ? () => undefined : onClose} title={title}>
      <div className="text-sm leading-relaxed text-ink-soft">{message}</div>
      <div className="mt-5 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="h-10 cursor-pointer rounded-md border border-hairline bg-surface px-4 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={pending}
          className={cn(
            'h-10 cursor-pointer rounded-md px-4 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-60',
            destructive
              ? 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:outline-destructive'
              : 'bg-brand text-brand-foreground hover:bg-brand-deep focus-visible:outline-brand',
          )}
        >
          {pending ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
