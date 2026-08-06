import { getAnalytics, isSupported, logEvent, setUserId, type Analytics } from 'firebase/analytics'
import { app } from '../firebase/config'
import { cleanEnv } from '../utils/env'

let analyticsInstance: Analytics | null = null
let initStarted = false
let settled = false
let resolveReady: () => void
const ready = new Promise<void>((resolve) => { resolveReady = resolve })

/**
 * Inicializa Firebase Analytics si hay `VITE_FIREBASE_MEASUREMENT_ID`
 * configurado y el navegador lo soporta (`isSupported()` da `false` en SSR,
 * Safari en navegación privada muy restrictiva, algunos in-app browsers,
 * etc.). Sin esa variable — como en desarrollo local sin configurar, o en
 * los tests, donde nunca está seteada — esta función no hace nada, igual que
 * initSentry() sin DSN: no rompe el arranque de la app. Llamar una sola vez,
 * desde main.tsx.
 */
export function initAnalytics(): void {
  if (initStarted) return
  initStarted = true

  const measurementId = cleanEnv(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID)
  if (!measurementId) {
    settle()
    return
  }

  isSupported()
    .then((supported) => {
      if (supported) analyticsInstance = getAnalytics(app)
    })
    .catch(() => {})
    .finally(settle)
}

function settle() {
  if (settled) return
  settled = true
  resolveReady()
}

type EventParams = Record<string, string | number | boolean>

// Los eventos disparados antes de que `isSupported()` resuelva (p.ej. el
// screen_view de la primera pantalla, que se dispara desde el primer render)
// no se pierden: quedan encolados detrás de la misma promesa `ready` y se
// entregan en orden apenas Analytics termina de inicializar. Si Analytics no
// está disponible (sin measurementId, o isSupported() dio false), track()
// sigue siendo un no-op seguro.
function track(eventName: string, params?: EventParams) {
  void ready.then(() => {
    if (!analyticsInstance) return
    logEvent(analyticsInstance, eventName, params)
  })
}

// Segmentos "estáticos" de las rutas declaradas en App.tsx. Cualquier
// segmento que NO esté acá se asume un identificador dinámico (eventId,
// qrToken, etc.) y se enmascara antes de mandarlo como nombre de pantalla —
// el pase (`/pass/:eventId/:qrToken`) es el caso real que hay que cuidar: el
// código QR nunca debe viajar a Analytics. Mantener sincronizado con las
// rutas de App.tsx si se agregan pantallas nuevas.
const STATIC_ROUTE_SEGMENTS = new Set([
  'login', 'register', 'forgot-password', 'reset-password', 'terminos', 'privacidad', 'feedback',
  'pass', 'events', 'arrive', 'join', 'wall', 'e', 'waitlist', 'dashboard', 'reports', 'seating',
  'live', 'menu', 'kitchen', 'profile', 'my-invitations', 'my-templates', 'my-events', 'new', 'edit',
  'admin', 'complete-profile', 'scan',
])

function sanitizeScreenName(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean).map((seg) => (STATIC_ROUTE_SEGMENTS.has(seg) ? seg : ':id'))
  return '/' + segments.join('/')
}

// ---- Navegación ----

/** Cambio de pantalla (ruta). `pathname` crudo — la sanitización de ids/tokens ocurre acá adentro. */
export function trackScreenView(pathname: string) {
  const screenName = sanitizeScreenName(pathname)
  track('screen_view', { firebase_screen: screenName, firebase_screen_class: screenName })
}

/** Apertura de la aplicación — una sola vez por sesión del navegador. */
export function trackAppOpened() {
  track('app_opened')
}

/** Un organizador/co-organizador abre el panel de un evento. */
export function trackEventOpen(eventId: string) {
  track('event_open', { event_id: eventId })
}

// ---- Eventos ----

export function trackEventCreate(eventId: string, templateId?: string) {
  track('event_create', templateId ? { event_id: eventId, template_id: templateId } : { event_id: eventId })
}

export function trackEventEdit(eventId: string) {
  track('event_edit', { event_id: eventId })
}

/** Cambio de estado del evento (activo/cancelado/archivado) — no hay un paso de "publicar" separado en PaseLink: un evento queda activo (publicado) desde que se crea. */
export function trackEventStatusChange(eventId: string, status: string) {
  track('event_status_change', { event_id: eventId, status })
}

export function trackEventDelete(eventId: string) {
  track('event_delete', { event_id: eventId })
}

/** Sin flujo de "duplicar evento" implementado todavía — queda lista para cuando exista. */
export function trackEventDuplicate(eventId: string) {
  track('event_duplicate', { event_id: eventId })
}

// ---- Invitados ----

export function trackGuestAdd(eventId: string) {
  track('guest_add', { event_id: eventId })
}

export function trackGuestEdit(eventId: string) {
  track('guest_edit', { event_id: eventId })
}

export function trackGuestDelete(eventId: string) {
  track('guest_delete', { event_id: eventId })
}

export function trackGuestGroupRegister(eventId: string) {
  track('guest_group_register', { event_id: eventId })
}

export function trackGuestImport(eventId: string, method: 'bulk' | 'csv', count: number) {
  track('guest_import', { event_id: eventId, method, count })
}

// ---- RSVP ----

export function trackRsvpConfirm(eventId: string) {
  track('rsvp_confirm', { event_id: eventId })
}

export function trackRsvpDecline(eventId: string) {
  track('rsvp_decline', { event_id: eventId })
}

// ---- Check-in / check-out ----

export function trackCheckIn(eventId: string) {
  track('checkin_completed', { event_id: eventId })
}

export function trackCheckOut(eventId: string, kind: 'temporary' | 'final') {
  track('checkout_completed', { event_id: eventId, kind })
}

// ---- Administración ----

export function trackLogin(method: 'password' | 'google') {
  track('login', { method })
}

export function trackLogout() {
  track('logout')
}

/** Asocia el uid (no es información sensible, es un identificador opaco) a los eventos siguientes. Llamar con `null` al cerrar sesión. */
export function setAnalyticsUserId(uid: string | null) {
  void ready.then(() => {
    if (!analyticsInstance) return
    setUserId(analyticsInstance, uid)
  })
}
