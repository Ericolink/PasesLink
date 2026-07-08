import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore'
import { captureException } from '../lib/sentry'
import { cleanEnv } from '../utils/env'

// cleanEnv() (no el valor crudo de import.meta.env) por cada campo: un
// secret de GitHub Actions cargado con un salto de línea de más (p.ej.
// `gh secret set NOMBRE < archivo.txt`) viaja tal cual hasta acá, y Firebase
// Auth arma con authDomain/apiKey la URL del iframe de login — ese \n de
// más se codifica como %0A en medio de la URL y el iframe de Google la
// rechaza ("Illegal url for new iframe"), tumbando el login con Google/
// Facebook por completo aunque el resto de la app funcione bien.
const firebaseConfig = {
  apiKey: cleanEnv(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnv(import.meta.env.VITE_FIREBASE_APP_ID),
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// getFirestore(app) por defecto deja que el SDK "autodetecte" si puede usar
// streaming (WebChannel) — en Safari (y detrás de varios proxies/VPN/
// bloqueadores de ads) esa autodetección puede fallar en silencio y el SDK
// recién lo nota tras un timeout largo antes de reintentar con long-polling,
// lo que explica cuelgues de 20-30s en CUALQUIER operación (crear/eliminar
// evento, confirmar invitación, etc. — todas pasan por esta misma conexión)
// que además coinciden con el aviso de rendimiento que muestra Safari. Forzar
// la autodetección explícitamente (en vez de esperar a que el SDK la
// descubra sola) evita ese timeout inicial en los navegadores/redes
// problemáticos, sin penalizar a los que sí soportan streaming.
// `persistentLocalCache` agrega cache local (IndexedDB) para que una
// relectura del mismo documento no dependa de la red — mismo motivo por el
// que abrir dos veces el dashboard del mismo evento se siente instantáneo la
// segunda vez. Si IndexedDB no está disponible (Safari en navegación
// privada la restringe en algunas versiones) el constructor puede tirar
// sincrónicamente al arrancar la app — se degrada a cache en memoria en vez
// de dejar la app entera sin cargar por esto, que es una mejora secundaria,
// no la causa de los cuelgues (esa es `experimentalAutoDetectLongPolling`,
// arriba).
function createDb() {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  } catch (err) {
    console.error('No se pudo activar el cache persistente de Firestore, usando cache en memoria:', err)
    captureException(err, { tags: { flow: 'firestore.config' } })
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache(),
    })
  }
}

export const db = createDb()
export const googleProvider = new GoogleAuthProvider()
export const facebookProvider = new FacebookAuthProvider()

// App Check (anti-bot): solo se activa si hay site key configurada. Sin esto,
// los formularios públicos (wall, auto-registro) quedan sin esa capa.
// Requiere: crear una clave reCAPTCHA v3 en https://www.google.com/recaptcha/admin
// y registrarla en Firebase Console > App Check > Firestore, antes de forzar
// la verificación ("Enforce") ahí — sin eso, esta inicialización no hace nada.
//
// Import dinámico (no estático arriba) a propósito: 'firebase/app-check' +
// el script de reCAPTCHA v3 que carga son el bulto más pesado del bundle
// inicial. Separarlo en su propio chunk deja que el navegador lo baje en
// paralelo en vez de bloquear el parseo/ejecución del bundle principal antes
// del primer render — la protección sigue activándose de inmediato (no se
// espera a un login ni a una acción del usuario), solo deja de viajar inline.
const recaptchaSiteKey = cleanEnv(import.meta.env.VITE_RECAPTCHA_SITE_KEY)
if (recaptchaSiteKey) {
  import('firebase/app-check').then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  })
}
