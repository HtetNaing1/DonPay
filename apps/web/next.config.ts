import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Monorepo root; a stray lockfile in $HOME otherwise breaks root inference
  outputFileTracingRoot: path.join(__dirname, '../..'),
};

export default nextConfig;
