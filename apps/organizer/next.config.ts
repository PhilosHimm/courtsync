import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // packages/core and packages/scheduling ship raw TypeScript with no build
  // step (see CLAUDE.md — "Packages ship raw TypeScript"). Next transpiles
  // their sources itself rather than expecting compiled output.
  transpilePackages: ['@courtsync/core', '@courtsync/scheduling'],
};

export default nextConfig;
