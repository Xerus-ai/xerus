/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Strip console.log/warn from production builds (keep console.error for critical failures)
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error'] }
      : false,
    // Strip data-testid from production builds (E2E test selectors, zero cost in prod)
    reactRemoveProperties: process.env.NODE_ENV === 'production'
      ? { properties: ['^data-testid$'] }
      : false,
  },

  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**.xerus.ai' },
    ],
  },

  // Security + CORS headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: process.env.NODE_ENV === 'production'
              ? "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.xerus.ai https://*.neon.tech https://*.firebaseio.com https://*.firebasestorage.app https://*.googleapis.com https://*.openrouter.ai https://*.pipedream.com wss://*.firebaseio.com; frame-src 'self' https://*.fly.dev https://*.daytona.io https://*.pipedream.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
              : "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.gstatic.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:* https://*.xerus.ai https://*.neon.tech https://*.firebaseio.com https://*.firebasestorage.app https://*.googleapis.com https://*.openrouter.ai https://*.pipedream.com wss://*.firebaseio.com; frame-src 'self' http://localhost:* https://*.fly.dev https://*.daytona.io https://*.pipedream.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
          },
        ],
      },
    ];
  },
  
  webpack: (config, { isServer }) => {
    // Handle Firebase and other Node.js modules in browser environment
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      }
    }
    return config
  },
  
  async redirects() {
    return [
      {
        source: '/skill/:slug',
        destination: '/skills/:slug',
        permanent: true,
      },
      // Block e2e-auth page in production — returns 404 even if the page file exists
      ...(process.env.NODE_ENV === 'production'
        ? [{
            source: '/e2e-auth',
            destination: '/not-found',
            permanent: false,
          }]
        : []),
    ];
  },

  experimental: {
  }
}

module.exports = nextConfig 