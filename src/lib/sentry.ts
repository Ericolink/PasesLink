import * as Sentry from '@sentry/react'
import { useEffect } from 'react'
import { Routes, createRoutesFromChildren, matchRoutes, useLocation, useNavigationType } from 'react-router-dom'

// Campos que jamás deben salir del navegador hacia Sentry — mismo criterio
// que firestore.rules aplica a `guestContacts` (email/teléfono de invitados
// nunca son públicos). Filtro defensivo por nombre de clave: cubre tanto el
// contexto que agregamos a mano (`extra`) como cualquier dato de estado que
// Sentry adjunte automáticamente.
const PII_KEY_PATTERN = /email|phone|telefono|contact/i

function scrubPii<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value as object)) return value
  seen.add(value as object)
  if (Array.isArray(value)) {
    return value.map((item) => scrubPii(item, seen)) as unknown as T
  }
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = PII_KEY_PATTERN.test(key) ? '[scrubbed]' : scrubPii(val, seen)
  }
  return out as T
}

/**
 * Inicializa Sentry si hay DSN configurado. Sin `VITE_SENTRY_DSN` (por
 * ejemplo en desarrollo local sin configurar), esta función no hace nada —
 * igual que sendWelcomeEmail/uploadImage cuando falta su configuración, no
 * rompe el arranque de la app.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // No capturar bodies de requests salientes: nuestras llamadas a
    // api.emailjs.com llevan email/nombre del invitado en el payload, y no
    // necesitamos ese detalle para depurar — el evento ya queda tageado con
    // { flow: 'emailjs' } (ver utils/emailjs.ts). userInfo:false es el
    // default del SDK, se deja explícito para que quede documentado acá.
    dataCollection: {
      userInfo: false,
      httpBodies: [],
    },
    integrations: [
      Sentry.reactRouterBrowserTracingIntegration({
        useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
      }),
      // Solo graba el buffer previo a un error real (~30s) en vez de
      // sesiones completas — así entra cómodo en la cuota gratis de Sentry
      // incluso si el tráfico crece. maskAllText/blockAllMedia evitan que la
      // grabación capture texto o imágenes visibles en pantalla (nombres,
      // fotos de invitados, etc.).
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    beforeSend(event) {
      if (event.extra) event.extra = scrubPii(event.extra)
      if (event.contexts) event.contexts = scrubPii(event.contexts)
      return event
    },
  })
}

// `<Routes>` instrumentado: cada cambio de ruta queda nombrado con su path
// (p. ej. "/events/:eventId/scan") en vez de aparecer como "/" genérico en
// las transacciones de performance. Reemplaza al `Routes` de
// react-router-dom en App.tsx, sin cambiar ningún `<Route>` existente.
export const SentryRoutes = Sentry.wrapReactRouterRouting(Routes)

type CaptureContext = { tags?: Record<string, string>; extra?: Record<string, unknown> }

/** Reporta una excepción a Sentry. No-op si Sentry no está inicializado (sin DSN). */
export function captureException(error: unknown, context?: CaptureContext) {
  Sentry.captureException(error, context)
}

/**
 * Envuelve el `onError` de un listener `onSnapshot` para que SIEMPRE llegue a
 * Sentry (nunca hay uno "normal": un permission-denied o un unavailable acá
 * es siempre un problema real — regresión de reglas, cuota agotada, etc.),
 * además de seguir llamando al `onError` que la pantalla ya tenía (o ninguno,
 * si no pasaba uno). `tag` identifica qué listener falló en Sentry.
 */
export function withListenerReporting(tag: string, onError?: (error: Error) => void) {
  return (error: Error) => {
    captureException(error, { tags: { listener: tag } })
    onError?.(error)
  }
}

/** Identifica al usuario autenticado en los eventos de Sentry. Llamar con `null` al cerrar sesión. */
export function setSentryUser(user: { uid: string; email: string | null } | null) {
  Sentry.setUser(user ? { id: user.uid, email: user.email ?? undefined } : null)
}

/**
 * Envuelve una operación async en un span de performance con nombre y
 * categoría (`op`) propios, para medir solo las operaciones que realmente
 * importan (check-in, subida de imágenes, alta de invitados) en vez de
 * instrumentar cada llamada a Firestore/Cloudinary por separado.
 */
export function measureSpan<T>(name: string, op: string, callback: () => Promise<T>): Promise<T> {
  return Sentry.startSpan({ name, op }, callback)
}
