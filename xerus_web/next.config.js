/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Server-side rendering for standalone deployment
  images: {
    domains: ['localhost', 'api.xerus.ai', 'app.xerus.ai', 'xerus.ai'],
  },

  // Headers for Firebase Auth popup support
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
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
  
  // Allow dynamic routes without generateStaticParams
  experimental: {
    missingSuspenseWithCSRBailout: false
  }
}

module.exports = nextConfig 