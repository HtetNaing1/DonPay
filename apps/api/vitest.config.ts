import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    root: './',
  },
  plugins: [
    // Required for NestJS: esbuild does not emit decorator metadata
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
