import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Hosted under a sub-path on GitHub Pages: the workflow sets BASE_PATH=/hanzi-hunters/
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Hanzi Hunters',
        short_name: 'Hanzi Hunters',
        description: 'Learn Chinese by exploring dungeons.',
        theme_color: '#101827',
        background_color: '#101827',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: []
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] }
    })
  ]
})