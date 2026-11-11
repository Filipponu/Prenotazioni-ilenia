import type { NextConfig } from 'next'

// Esportazione statica: il pannello è fatto solo di file HTML/JS/CSS,
// serviti gratis da Cloudflare (nessun rendering lato server).
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@ilenia/shared'],
  reactStrictMode: true,
}

export default config
