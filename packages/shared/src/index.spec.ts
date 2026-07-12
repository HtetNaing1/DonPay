import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from './index';

describe('shared package', () => {
  it('exports the package name', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@donpay/shared');
  });
});
