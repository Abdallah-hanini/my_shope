import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Linting runs as its own turbo task (pnpm lint) with the shared flat config.
  eslint: { ignoreDuringBuilds: true },
  // Check-in photo uploads go through a server action: up to 5 files of 12 MB (PHOTO_LIMITS).
  // The API re-checks the limits and re-encodes every image.
  experimental: { serverActions: { bodySizeLimit: '64mb' } },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
