import { LinkStatus } from '../generated/prisma/client';

export interface LinkStatusInputs {
  status: LinkStatus;
  expiresAt: Date | null;
  maxUses: number | null;
  useCount: number;
}

/**
 * Effective status: what the stored row means *now*. EXPIRED/COMPLETED are
 * derived on read so no cron has to sweep rows; the stored status only
 * changes through explicit writes (pause/resume, and the state machine
 * marking one-time links COMPLETED in week 2).
 */
export function effectiveLinkStatus(
  link: LinkStatusInputs,
  now: Date,
): LinkStatus {
  if (link.status !== 'ACTIVE') return link.status;
  if (link.expiresAt !== null && link.expiresAt <= now) return 'EXPIRED';
  if (link.maxUses !== null && link.useCount >= link.maxUses) {
    return 'COMPLETED';
  }
  return 'ACTIVE';
}
