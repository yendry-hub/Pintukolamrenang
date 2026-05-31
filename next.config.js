/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.BUILD_MODE === 'export' ? { output: 'export' } : {}),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
}

module.exports = nextConfig
