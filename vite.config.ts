import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'Icon.png', 'Logo.png', 'robots.txt'],
      manifest: {
        name: 'PaseLink — Gestión de invitados para eventos',
        short_name: 'PaseLink',
        description:
          'Crea eventos, envía invitaciones con QR y controla el acceso de tus invitados en tiempo real.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#150D1C',
        background_color: '#150D1C',
        categories: ['events', 'productivity'],
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Mis eventos',
            url: '/dashboard',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192' }],
          },
          {
            name: 'Crear evento',
            url: '/events/new',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192' }],
          },
          {
            name: 'Mis invitaciones',
            url: '/my-invitations',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,webmanifest}', 'icons/*.png'],
        navigateFallback: '/index.html',
        // /__/* son los helpers de Firebase Hosting (p. ej. /__/auth para el
        // popup de Google/Facebook) — nunca deben caer en el fallback del SW.
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 10 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-woff',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/res\.cloudinary\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cloudinary-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    // Los tests de src/firebase/__tests__ necesitan el emulador de Firestore corriendo;
    // se ejecutan aparte con `npm run test:firebase` (ver vitest.firebase.config.ts).
    exclude: [...configDefaults.exclude, 'src/firebase/__tests__/**'],
  },
})
