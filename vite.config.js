import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: {
    port: 5174,
    strictPort: true,
    open: true
  },
  build: {
    outDir: 'dist'
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      updateViaCache: 'none',
      injectRegister: 'auto',
      includeAssets: [
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png'
      ],
      manifest: {
        name: 'Freestyle King',
        short_name: 'Freestyle King',
        description: 'Welcome to the dojo of rappers. Make friends, practice rhyming, share songs.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#222428',
        theme_color: '#ffffff',
        icons: [
          {
            src: './pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: './pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: './pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        globIgnores: ['**/logo.png'],
        navigateFallback: undefined,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === 'https://cdn.jsdelivr.net' ||
              url.origin === 'https://unpkg.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-assets',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      }
    })
  ]
});
