import { Injectable } from '@nestjs/common';

/**
 * Narrow time abstraction (CLAUDE.md "I/D"). Services with expiry logic
 * inject CLOCK instead of calling Date.now(), so tests control time.
 */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
