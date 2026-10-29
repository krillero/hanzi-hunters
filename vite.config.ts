import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Hosted under a sub-path on GitHub Pages: the workflow sets BASE_PATH=/hanzi-hunters/
const base = process.env.BASE_PATH ?? '/'

// Identifies this build. Shown in the app and written to version.json so a running (possibly cached) copy can tell it is outdated.
const commit = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return 'local' }
})()
const BUILD = { commit, time: new Date().toISOString() }
const versionJson = { name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(BUILD) }) } }

export default defineConfig({
  base,
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    versionJson,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Hanzi Hunters',
        short_name: 'Hanzi Hunters',
        description: 'Learn Chinese by exploring dungeons.',
        theme_color: '#101827',
        background_color: '#101827',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icons/icon-512-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] }
    })
  ]
})