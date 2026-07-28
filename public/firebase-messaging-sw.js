// Service worker de Firebase Cloud Messaging (Feature 5: push notifications)
// — INDEPENDIENTE del service worker que genera vite-plugin-pwa/Workbox
// (ver vite.config.ts). Es el patrón que documenta Firebase para proyectos
// que no usan `injectManifest`: un archivo estático propio en public/,
// registrado por separado (ver src/firebase/messaging.ts) — ambos
// coexisten sin pisarse, cada uno con su propio scope de registro.
//
// Config vía query string, NO hardcodeada: este archivo es estático (no
// pasa por Vite), así que no puede leer las variables VITE_FIREBASE_* del
// build. src/firebase/messaging.ts arma la URL de registro con esos mismos
// valores (ya públicos, se envían igual dentro del bundle del navegador) —
// una sola fuente de verdad para la config, sin duplicarla acá adentro.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

const params = new URLSearchParams(self.location.search)
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
}

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig)
  const messaging = firebase.messaging()

  // Notificación en segundo plano (pestaña/app cerrada) — con la app
  // abierta y en foco, Firebase entrega el mensaje vía onMessage() en el
  // hilo principal en su lugar (ver messaging.ts), no acá.
  messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {}
    const deepLink = payload.data && payload.data.deepLink
    self.registration.showNotification(title || 'PaseLink', {
      body: body || '',
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
      data: { deepLink },
    })
  })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const deepLink = (event.notification.data && event.notification.data.deepLink) || '/dashboard'
  event.waitUntil(self.clients.openWindow(deepLink))
})
