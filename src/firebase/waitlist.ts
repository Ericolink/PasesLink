// Lista de espera — invitado (ver WAITLIST_RECONFIRMATION_ARCHITECTURE.md).
// Las transiciones de estado que importan (offered/promoted/expired/
// declined) son exclusivas de Cloud Functions (Admin SDK, ignora las
// rules) — este archivo solo llama a esas Callable Functions, nunca
// escribe esos campos directo a Firestore.
import { addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './config'
import type { PaymentMethod, WaitlistEntryData } from '../types'
import { WaitlistEntrySchema, warnIfInvalidShape } from '../types/schemas'
import { withListenerReporting } from '../lib/sentry'

function generateWaitlistToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

// No hace falta runTransaction: a diferencia de registrarse como invitado,
// unirse a la lista de espera no toca peopleCount/capacity — es la
// diferencia clave que mantiene simple todo este archivo.
export async function joinWaitlist(
  eventId: string,
  name: string,
  partySize: number,
  phone?: string,
  phoneCountry?: string,
  email?: string,
  customData?: Record<string, string>,
): Promise<{ waitlistToken: string }> {
  const waitlistToken = generateWaitlistToken()
  await addDoc(collection(db, 'events', eventId, 'waitlist'), {
    name,
    partySize,
    ...(phone ? { phone, whatsappConsent: true } : {}),
    ...(phoneCountry ? { phoneCountry } : {}),
    ...(email ? { email } : {}),
    ...(customData && Object.keys(customData).length > 0 ? { customData } : {}),
    waitlistToken,
    status: 'waiting',
    priorityBoost: 0,
    createdAt: serverTimestamp(),
    offerToken: null,
    offerExpiresAt: null,
    respondedAt: null,
    promotedGuestId: null,
    promotionReason: null,
  })
  return { waitlistToken }
}

function toMillisOrNull(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return null
}

function mapWaitlistEntry(id: string, data: Record<string, unknown>): WaitlistEntryData {
  const entry: WaitlistEntryData = {
    id,
    name: (data.name as string) || '',
    partySize: (data.partySize as number) ?? 1,
    phone: (data.phone as string) || undefined,
    phoneCountry: (data.phoneCountry as string) || undefined,
    email: (data.email as string) || undefined,
    customData: (data.customData as Record<string, string>) || undefined,
    waitlistToken: (data.waitlistToken as string) || '',
    status: (data.status as WaitlistEntryData['status']) || 'waiting',
    priorityBoost: (data.priorityBoost as number) ?? 0,
    createdAt: toMillisOrNull(data.createdAt) || 0,
    offerToken: (data.offerToken as string) || null,
    offerExpiresAt: (data.offerExpiresAt as number) ?? null,
    respondedAt: (data.respondedAt as number) ?? null,
    promotedGuestId: (data.promotedGuestId as string) ?? null,
    promotionReason: (data.promotionReason as WaitlistEntryData['promotionReason']) ?? null,
  }
  warnIfInvalidShape(WaitlistEntrySchema, 'WaitlistEntry', entry)
  return entry
}

// En vivo (a diferencia de GuestPass.tsx, que evita listeners en vivo por el
// costo de fan-out a miles de pases abiertos a la vez — acá el volumen
// esperado es muchísimo menor, y ver la oferta aparecer sin refrescar la
// página es la mejora de UX central de toda esta feature). `limit(1)` es lo
// que autoriza esta query del lado de firestore.rules (allow list: if
// request.query.limit <= 1) — no una comparación de token en la regla.
export function subscribeToWaitlistEntry(
  eventId: string,
  waitlistToken: string,
  callback: (entry: WaitlistEntryData | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'events', eventId, 'waitlist'),
    where('waitlistToken', '==', waitlistToken),
    limit(1),
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.empty ? null : mapWaitlistEntry(snap.docs[0].id, snap.docs[0].data())),
    withListenerReporting('waitlistEntry', onError),
  )
}

// El invitado confirma la oferta ("¡Se liberó un lugar para ti!") — crea
// el guest doc real, de mayor riesgo que cualquier otra escritura de este
// archivo, por eso vive en una Cloud Function y no acá (ver
// functions/src/callable/confirmWaitlistOffer.ts). La oferta no vence sola
// (el organizador la cancela a mano si hace falta, ver cancelWaitlistOffer
// más abajo) — puede lanzar FirebaseError con código 'failed-precondition'
// (oferta ya resuelta/cancelada) o 'resource-exhausted' (el cupo se llenó
// por otro camino mientras la oferta estaba activa) — el caller
// (WaitlistStatus.tsx) decide cómo mostrar cada caso.
export async function confirmWaitlistOffer(
  eventId: string,
  entryId: string,
  offerToken: string,
  paymentMethod?: PaymentMethod,
): Promise<{ qrToken: string }> {
  const callable = httpsCallable<
    { eventId: string; entryId: string; offerToken: string; paymentMethod?: PaymentMethod },
    { qrToken: string }
  >(functions, 'confirmWaitlistOffer')
  const result = await callable({ eventId, entryId, offerToken, paymentMethod })
  return result.data
}

export async function declineWaitlistOffer(eventId: string, entryId: string, offerToken: string): Promise<void> {
  const callable = httpsCallable<{ eventId: string; entryId: string; offerToken: string }, { ok: boolean }>(functions, 'declineWaitlistOffer')
  await callable({ eventId, entryId, offerToken })
}

// Dashboard del organizador — ver src/components/WaitlistPanel.tsx.

// 'waiting' y 'offered' son los únicos estados que le importan al
// organizador en la fila activa (promoted/declined/expired/removed son
// historial, no algo que gestionar). El mismo índice compuesto
// (status, priorityBoost, createdAt) sirve tanto para esta query de
// colección como para la collection-group query de la cascada en Functions
// — ver firestore.indexes.json.
export function subscribeToWaitlist(
  eventId: string,
  callback: (entries: WaitlistEntryData[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'events', eventId, 'waitlist'),
    where('status', 'in', ['waiting', 'offered']),
    orderBy('priorityBoost', 'desc'),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapWaitlistEntry(d.id, d.data()))),
    withListenerReporting('waitlist', onError),
  )
}

// "Mover al frente de la fila": lee el priorityBoost más alto actual entre
// las 'waiting' y escribe max+1 en la entrada elegida — una sola escritura,
// sin reordenar el resto de la fila (ver §7.1 del RFC). No es una
// transacción: si dos organizadores mueven a alguien al frente casi al
// mismo tiempo, en el peor caso las dos quedan cerca del frente, no hay
// ninguna forma de corromper datos — firestore.rules igual exige que el
// valor nuevo sea estrictamente mayor al que tenía esta entrada.
export async function moveWaitlistEntryToFront(eventId: string, entryId: string): Promise<void> {
  const q = query(
    collection(db, 'events', eventId, 'waitlist'),
    where('status', '==', 'waiting'),
    orderBy('priorityBoost', 'desc'),
    limit(1),
  )
  const snap = await getDocs(q)
  const currentMax = snap.empty ? 0 : ((snap.docs[0].data().priorityBoost as number) ?? 0)
  await updateDoc(doc(db, 'events', eventId, 'waitlist', entryId), { priorityBoost: currentMax + 1 })
}

// Solo entradas 'waiting' (ver firestore.rules, la rama de update solo
// permite 'waiting'→'removed'). Para quitar a alguien con una oferta
// activa, primero cancela la oferta (cancelWaitlistOffer) — vuelve a
// 'waiting' y ahí sí se puede quitar.
export async function removeFromWaitlist(eventId: string, entryId: string): Promise<void> {
  await updateDoc(doc(db, 'events', eventId, 'waitlist', entryId), { status: 'removed' })
}

// "Asignar lugar": promoción manual saltando el orden — misma Callable que
// dispara la oferta automática, con reason: 'manual' (ver
// functions/src/callable/promoteWaitlistEntry.ts). Sigue siendo una
// OFERTA (el invitado tiene que confirmar), no una asignación instantánea
// — pero ya no vence sola, ver cancelWaitlistOffer.
export async function promoteWaitlistEntryManually(eventId: string, entryId: string): Promise<void> {
  const callable = httpsCallable<{ eventId: string; entryId: string }, { ok: boolean }>(functions, 'promoteWaitlistEntry')
  await callable({ eventId, entryId })
}

// El organizador cancela una oferta activa (nadie respondió y no quiere
// esperar más) — reemplaza el vencimiento automático de 24h del diseño
// original. Vuelve la entrada a 'waiting' conservando su lugar en la fila
// (no fue elección del invitado) y le ofrece el lugar a quien siga.
export async function cancelWaitlistOffer(eventId: string, entryId: string): Promise<void> {
  const callable = httpsCallable<{ eventId: string; entryId: string }, { ok: boolean }>(functions, 'cancelWaitlistOffer')
  await callable({ eventId, entryId })
}

// "Asignar lugar" (instantáneo): a diferencia de promoteWaitlistEntryManually
// (que solo crea una oferta y espera a que el invitado confirme por correo),
// esta acción crea el guest confirmado de inmediato — el organizador decide
// sin pedirle confirmación a la persona. Funciona tanto sobre una entrada
// 'waiting' como sobre una con oferta activa (la reemplaza). El invitado se
// entera por correo (si dejó uno), no por el link de oferta de siempre.
export async function assignWaitlistSpot(eventId: string, entryId: string, paymentMethod?: PaymentMethod): Promise<{ qrToken: string }> {
  const callable = httpsCallable<{ eventId: string; entryId: string; paymentMethod?: PaymentMethod }, { qrToken: string }>(functions, 'assignWaitlistSpot')
  const result = await callable({ eventId, entryId, paymentMethod })
  return result.data
}
