/** BullMQ queue name for chain watching. */
export const WATCH_QUEUE_NAME = 'chain-watch';

/**
 * One watch tick. Jobs self-reschedule as delayed jobs (persisted in Redis,
 * so a worker restart resumes every watch — NFR-4). `mode` only picks the
 * cadence; the authoritative state is always the intent row read at tick
 * time. Everything here must stay JSON-serializable.
 */
export interface WatchJobData {
  intentId: string;
  /** active = 3s pre-expiry polling; tail = low-frequency 24h late-payment watch. */
  mode: 'active' | 'tail';
  /** Consecutive RPC failures — drives exponential backoff, reset on success. */
  errorCount: number;
}
