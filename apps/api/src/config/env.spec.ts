import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const VALID = { DATABASE_URL: 'postgresql://user:pw@host/db' };

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv(VALID);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('coerces PORT from string', () => {
    expect(validateEnv({ ...VALID, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects invalid values', () => {
    expect(() => validateEnv({ ...VALID, PORT: 'not-a-port' })).toThrow(
      /Invalid environment/,
    );
    expect(() => validateEnv({ ...VALID, NODE_ENV: 'staging' })).toThrow(
      /Invalid environment/,
    );
    expect(() => validateEnv({ ...VALID, LOG_LEVEL: 'verbose' })).toThrow(
      /Invalid environment/,
    );
  });
});
