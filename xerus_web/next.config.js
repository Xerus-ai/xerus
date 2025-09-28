/** @type {import('next').NextConfig} */
const path = require('path');
const fs = require('fs');

// Load environment variables from parent directory
// const parentEnvPath = path.join(__dirname, '../.env');
// if (fs.existsSync(parentEnvPath)) {
//   const envContent = fs.readFileSync(parentEnvPath, 'utf8');
//   const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
//   envLines.forEach(line => {
//     const [key, ...valueParts] = line.split('=');
//     const value = valueParts.join('=').trim();
//     if (key && value) {
//       process.env[key] = value;
//     }
//   });
// }

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Static export enabled for Electron app (serves from out folder)
  output: 'export',
  images: { unoptimized: true },
  
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
  
  // Allow dynamic routes without generateStaticParams and Windows optimization
  experimental: {
    missingSuspenseWithCSRBailout: false,
    workerThreads: false,
    cpus: 1
  }
}

module.exports = nextConfig 