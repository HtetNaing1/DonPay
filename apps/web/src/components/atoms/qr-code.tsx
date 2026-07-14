'use client';

import { QRCodeCanvas } from 'qrcode.react';
import { cn } from '@/lib/utils';

interface QrCodeProps {
  /** Absolute URL to encode. */
  value: string;
  /** Rendered size in px; the canvas itself is 512px for print quality. */
  displaySize?: number;
  className?: string;
}

/**
 * QR on a white quiet zone (scannable in dark mode too). The canvas renders
 * at 512px so a save/copy of it is print quality; query it via a wrapper ref.
 */
export function QrCode({ value, displaySize = 224, className }: QrCodeProps) {
  return (
    <span className={cn('inline-block rounded-lg bg-white p-3', className)}>
      <QRCodeCanvas
        value={value}
        size={512}
        marginSize={1}
        style={{ width: displaySize, height: displaySize }}
      />
    </span>
  );
}
