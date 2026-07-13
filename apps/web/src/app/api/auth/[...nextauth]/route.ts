// Auth.js session endpoints — the one Next route that isn't business logic.
// Everything else calls the NestJS API directly (CLAUDE.md rule 12).
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
