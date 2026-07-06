import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'
import type { Feedback, FeedbackCategory, FeedbackPriority, FeedbackStatus } from '../types'
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_EMAIL_MAX,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_MESSAGE_MIN,
  FEEDBACK_SUBJECT_MAX,
  requireMaxLength,
  requireMinLength,
  requireNonEmpty,
  requireValidEmail,
  sanitizeFeedbackText,
} from '../utils/validation'

// Debe coincidir con duration.value(45, 's') en firestore.rules
// (feedbackCooldownOk) — reforzado por reglas para usuarios logueados, y
// aplicado del lado cliente (mejor esfuerzo) para envíos anónimos.
const FEEDBACK_COOLDOWN_MS = 45_000
const ANON_COOLDOWN_KEY = 'feedback_last_submit_at'

export interface SubmitFeedbackInput {
  userId: string | null
  userEmail: string | null
  userDisplayName: string | null
  subject: string
  message: string
  category: FeedbackCategory
  // Campo honeypot: un humano nunca lo llena (está oculto en el formulario).
  // Si llega con contenido, se asume un bot y se resuelve sin escribir nada,
  // para no delatarle que fue detectado.
  honeypot: string
}

export async function submitFeedback(input: SubmitFeedbackInput): Promise<void> {
  if (input.honeypot) return

  const subject = requireMaxLength(
    requireNonEmpty(sanitizeFeedbackText(input.subject), 'El asunto'),
    FEEDBACK_SUBJECT_MAX,
    'El asunto',
  )
  const message = requireMaxLength(
    requireMinLength(sanitizeFeedbackText(input.message), FEEDBACK_MESSAGE_MIN, 'El mensaje'),
    FEEDBACK_MESSAGE_MAX,
    'El mensaje',
  )
  if (!FEEDBACK_CATEGORIES.includes(input.category)) {
    throw new Error('Selecciona una categoría válida.')
  }

  const basePayload = {
    subject,
    message,
    category: input.category,
    status: 'new' as FeedbackStatus,
    priority: 'normal' as FeedbackPriority,
    tags: [] as string[],
    adminNotes: '',
    favorite: false,
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  if (input.userId) {
    const rateLimitRef = doc(db, 'feedbackRateLimits', input.userId)
    await runTransaction(db, async (transaction) => {
      const rlSnap = await transaction.get(rateLimitRef)
      if (rlSnap.exists()) {
        const lastAt = rlSnap.data().lastAt as Timestamp | undefined
        if (lastAt && Date.now() - lastAt.toMillis() < FEEDBACK_COOLDOWN_MS) {
          throw new Error('Espera un momento antes de enviar otro comentario.')
        }
      }
      transaction.set(doc(collection(db, 'feedback')), {
        ...basePayload,
        userId: input.userId,
        userEmail: null,
        userDisplayName: input.userDisplayName,
      })
      transaction.set(rateLimitRef, { lastAt: serverTimestamp() })
    })
    return
  }

  // Envío anónimo: cooldown solo del lado cliente — ver firestore.rules
  // (feedbackCooldownOk) para por qué no se puede reforzar con reglas sin
  // una identidad verificable.
  const lastSubmit = Number(localStorage.getItem(ANON_COOLDOWN_KEY) || 0)
  if (Date.now() - lastSubmit < FEEDBACK_COOLDOWN_MS) {
    throw new Error('Espera un momento antes de enviar otro comentario.')
  }
  const email = requireValidEmail(input.userEmail || '', 'El email')
  requireMaxLength(email, FEEDBACK_EMAIL_MAX, 'El email')

  await addDoc(collection(db, 'feedback'), {
    ...basePayload,
    userId: null,
    userEmail: email,
    userDisplayName: input.userDisplayName,
  })
  localStorage.setItem(ANON_COOLDOWN_KEY, String(Date.now()))
}

// Sin `limit()` a propósito, mismo criterio que subscribeToAllEvents en
// firebase/admin.ts: panel de un solo admin, bajo volumen esperado. Si el
// volumen crece, separar en vivo (ventana reciente) + carga histórica a
// pedido, como ya hace wall.ts.
export function subscribeToAllFeedback(
  callback: (items: Feedback[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => mapFeedback(d.id, d.data()))),
    withListenerReporting('feedback.all', onError),
  )
}

// Contador barato para el badge de "no leídos" (Navbar + pestaña Buzón) —
// snapshot.size sobre una consulta acotada, sin descargar mensajes leídos.
export function subscribeToUnreadFeedbackCount(
  callback: (count: number) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'feedback'), where('read', '==', false))
  return onSnapshot(q, (snapshot) => callback(snapshot.size), withListenerReporting('feedback.unreadCount', onError))
}

export async function markFeedbackRead(feedbackId: string): Promise<void> {
  await updateDoc(doc(db, 'feedback', feedbackId), { read: true, updatedAt: serverTimestamp() })
}

export async function updateFeedbackStatus(feedbackId: string, status: FeedbackStatus): Promise<void> {
  await updateDoc(doc(db, 'feedback', feedbackId), { status, updatedAt: serverTimestamp() })
}

export async function updateFeedbackPriority(feedbackId: string, priority: FeedbackPriority): Promise<void> {
  await updateDoc(doc(db, 'feedback', feedbackId), { priority, updatedAt: serverTimestamp() })
}

export async function updateFeedbackTags(feedbackId: string, tags: string[]): Promise<void> {
  await updateDoc(doc(db, 'feedback', feedbackId), { tags, updatedAt: serverTimestamp() })
}

export async function updateFeedbackNotes(feedbackId: string, adminNotes: string): Promise<void> {
  await updateDoc(doc(db, 'feedback', feedbackId), { adminNotes, updatedAt: serverTimestamp() })
}

export async function toggleFeedbackFavorite(feedbackId: string, currentlyFavorite: boolean): Promise<void> {
  await updateDoc(doc(db, 'feedback', feedbackId), { favorite: !currentlyFavorite, updatedAt: serverTimestamp() })
}

export async function deleteFeedback(feedbackId: string): Promise<void> {
  await deleteDoc(doc(db, 'feedback', feedbackId))
}

function mapFeedback(id: string, data: Record<string, unknown>): Feedback {
  return {
    id,
    userId: (data.userId as string) || null,
    userEmail: (data.userEmail as string) || null,
    userDisplayName: (data.userDisplayName as string) || null,
    subject: (data.subject as string) || '',
    message: (data.message as string) || '',
    category: (data.category as Feedback['category']) || 'other',
    status: (data.status as Feedback['status']) || 'new',
    priority: (data.priority as Feedback['priority']) || 'normal',
    tags: (data.tags as string[]) || [],
    adminNotes: (data.adminNotes as string) || '',
    favorite: (data.favorite as boolean) || false,
    read: (data.read as boolean) || false,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
