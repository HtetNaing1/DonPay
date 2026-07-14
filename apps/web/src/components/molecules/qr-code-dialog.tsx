'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Download, QrCode as QrCodeIcon } from 'lucide-react';
import { QrCode } from '@/components/atoms/qr-code';
import { Modal } from '@/components/molecules/modal';
import { cn } from '@/lib/utils';

interface QrCodeDialogButtonProps {
  /** Absolute URL to encode. */
  value: string;
  /** Download file name, without extension. */
  fileName: string;
  /** Dialog subtitle — say what the code opens ("/pay/abc123"). */
  subtitle?: string;
  className?: string;
}

/**
 * Icon button that opens the QR in a dialog with "Save PNG" and "Copy image".
 * Copy uses the async clipboard API; where unsupported the button explains
 * itself instead of failing silently.
 */
export function QrCodeDialogButton({
  value,
  fileName,
  subtitle,
  className,
}: QrCodeDialogButtonProps) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const qrHolder = useRef<HTMLDivElement>(null);

  const getCanvas = () => qrHolder.current?.querySelector('canvas');

  const handleSave = () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `${fileName}.png`;
    anchor.click();
  };

  const handleCopy = () => {
    const canvas = getCanvas();
    if (!canvas || typeof ClipboardItem === 'undefined') {
      setCopyState('failed');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        setCopyState('failed');
        return;
      }
      navigator.clipboard
        .write([new ClipboardItem({ 'image/png': blob })])
        .then(() => setCopyState('copied'))
        .catch(() => setCopyState('failed'));
    }, 'image/png');
  };

  const openDialog = () => {
    setCopyState('idle');
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label="Show QR code"
        className={cn(
          'inline-flex cursor-pointer items-center justify-center rounded-md p-2.5 text-ink-soft transition-colors duration-200 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          className,
        )}
      >
        <QrCodeIcon className="size-4" aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Checkout QR"
        description={subtitle}
      >
        <div className="flex flex-col items-center">
          <div ref={qrHolder}>
            <QrCode value={value} />
          </div>
          <p
            className="mt-3 max-w-full truncate font-mono text-[13px] text-ink-soft"
            title={value}
          >
            {value}
          </p>

          <div className="mt-4 flex w-full gap-2.5">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-brand text-sm font-medium text-brand-foreground transition-colors duration-200 hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <Download className="size-4" aria-hidden="true" />
              Save PNG
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-hairline bg-surface text-sm font-medium text-ink transition-colors duration-200 hover:border-ink-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {copyState === 'copied' ? (
                <>
                  <Check className="size-4 text-brand-deep" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-4" aria-hidden="true" />
                  Copy image
                </>
              )}
            </button>
          </div>
          {copyState === 'failed' && (
            <p role="alert" className="mt-2.5 text-[13px] text-destructive">
              This browser can’t copy images — use Save PNG instead.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
