import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, FacebookAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
export const facebookProvider = new FacebookAuthProvider()

// App Check (anti-bot): solo se activa si hay site key configurada. Sin esto,
// los formularios públicos (wall, waitlist, auto-registro) quedan sin esa capa.
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
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
if (recaptchaSiteKey) {
  import('firebase/app-check').then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  })
}
