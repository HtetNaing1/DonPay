'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Panel width override, e.g. "max-w-md". */
  className?: string;
}

/**
 * Site-styled dialog. Portals to <body> so no card/animation stacking context
 * can trap it. Bottom sheet on small screens, centered card from `sm` up.
 * Escape, backdrop tap, and the corner button all close it.
 */
export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      {/* Transparent hit area: closes on outside tap without dimming the page */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full max-w-sm rounded-xl border border-hairline bg-surface shadow-xl outline-none',
          'animate-in fade-in slide-in-from-bottom-4 duration-200 ease-out sm:slide-in-from-bottom-0 sm:slide-in-from-top-2 motion-reduce:animate-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg tracking-tight text-ink">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 shrink-0 cursor-pointer rounded-md p-1.5 text-ink-soft transition-colors duration-200 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
