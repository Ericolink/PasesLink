import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  build: {
    // Los mapas se generan siempre (el plugin de abajo los necesita para
    // asociar los errores de Sentry al código fuente real), pero no se
    // referencian desde el bundle público ni se suben a Firebase Hosting —
    // el plugin los borra localmente después de subirlos (ver
    // filesToDeleteAfterUpload). Sin token, no hay upload ni borrado: los
    // .map quedarían en dist/, por eso sourcemap solo se activa junto al plugin.
    sourcemap: process.env.SENTRY_AUTH_TOKEN ? 'hidden' : false,
    rollupOptions: {
      output: {
        // @sentry/replay (~90 KB gzip) solo se importa dinámicamente, en
        // idle, desde lib/sentry.ts (ver loadReplayLazily) — a propósito
        // para que NINGUNA página, ni siquiera las públicas de cara al
        // invitado, tenga que bajarlo antes de poder pintar. Sin este
        // manualChunks, Rollup igual lo separa en su propio chunk, pero con
        // un nombre hasheado que no se puede distinguir del resto para
        // excluirlo de los <link rel="modulepreload"> de abajo — nombrarlo
        // explícito es lo que permite ese filtro.
        manualChunks(id) {
          if (id.includes('node_modules/@sentry/replay')) return 'sentry-replay'
        },
      },
    },
    modulePreload: {
      // Vite precarga por defecto TODO chunk alcanzable por un import()
      // dinámico desde el entrypoint, aunque nunca se ejecute hasta idle —
      // eso anula el ahorro de ancho de banda de loadReplayLazily, porque el
      // navegador igual lo baja de entrada. Se excluye únicamente el chunk
      // de replay (ver manualChunks arriba); el resto de los dynamic
      // imports legítimos (páginas lazy, exportPdf, etc.) se siguen
      // precargando normalmente.
      resolveDependencies: (_filename, deps) => deps.filter((dep) => !dep.includes('sentry-replay')),
    },
  },
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
        // Antes se precacheaban los 104 archivos de la build (~3.1 MB) para
        // CUALQUIER visitante en su primera visita, incluidos chunks pesados
        // de rutas que un invitado (/pass, /join, /wall) nunca abre: el panel
        // de admin, el escáner (solo lo usa quien tiene el rol de puerta) y
        // las dependencias de exportar PDF (html2canvas + el propio
        // exportPdf, ~600 KB juntos). Se excluyen del precache — quedan
        // disponibles igual la primera vez que alguien SÍ visita esa ruta,
        // vía el runtimeCaching de abajo, y de ahí en adelante sí quedan
        // cacheados para esa persona puntual.
        globIgnores: ['**/AdminDashboard-*.js', '**/Scanner-*.js', '**/exportPdf-*.js', '**/html2canvas-*.js'],
        navigateFallback: '/index.html',
        // /__/* son los helpers de Firebase Hosting (p. ej. /__/auth para el
        // popup de Google/Facebook) — nunca deben caer en el fallback del SW.
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          {
            // Cubre los chunks recién excluidos del precache de arriba —
            // sin esta regla, quedarían sin cachear para siempre (se
            // bajarían de la red en cada visita a esa ruta, ni siquiera la
            // segunda vez). StaleWhileRevalidate: sirve la copia cacheada al
            // instante si ya existe, y de paso pide una versión fresca en
            // segundo plano para la próxima vez.
            urlPattern: /\/assets\/.*\.js$/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'app-chunks-lazy', expiration: { maxEntries: 20 } },
          },
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
              // v2 (antes 'cloudinary-images'): antes de este fix, GuestPass
              // era la única página que pedía la portada con
              // crossOrigin="anonymous" (modo CORS) mientras el resto la
              // pedía en modo normal — el Cache API de este service worker
              // indexa por URL nomás, sin distinguir el modo del request, así
              // que la respuesta que llegara primero (CORS u opaca) quedaba
              // cacheada para AMBOS modos durante hasta 30 días. Resultado:
              // en un dispositivo que ya había cacheado la versión opaca
              // (p.ej. viéndola antes en MyInvitations/EventDetail), la
              // portada dejaba de renderizar en GuestPass — el navegador
              // rechaza servir una respuesta opaca donde se pidió CORS. Ya
              // unificado (todo componente que muestra coverImage ahora pide
              // crossOrigin="anonymous"), pero cambiar el nombre del cache es
              // necesario para que los dispositivos con una entrada opaca ya
              // guardada no se queden pegados a ella hasta que expire sola.
              cacheName: 'cloudinary-images-v2',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    // Sube source maps y crea el release en Sentry durante `npm run build`.
    // Va al final del array a propósito (recomendación oficial de Sentry):
    // corre después de que el resto de los plugins terminó de escribir sus
    // archivos, así sube los artefactos finales. Sin SENTRY_AUTH_TOKEN
    // (desarrollo local, o CI sin el secret configurado todavía) se
    // desactiva solo — el build sigue funcionando igual, simplemente sin
    // subir mapas ni crear un release.
    sentryVitePlugin({
      disable: !process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.js.map'],
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
