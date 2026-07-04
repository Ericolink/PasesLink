import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { appendReportSanctionAction } from './moderation'
import type { SanctionHistoryEntry, SanctionScope, SanctionType, UserSanctionScopeState, UserSanctionSummary } from '../types'
import { SANCTION_TYPE_LABELS } from '../types'

// Sentinel para "sin vencimiento" — se usa en vez de null para que las
// reglas de Firestore (y el resto del código) puedan comparar siempre con un
// número (`bannedUntil > now`) sin ramificar por null/boolean.
export const PERMANENT_SANCTION_MS = Number.MAX_SAFE_INTEGER

const EMPTY_SCOPE: UserSanctionScopeState = { bannedUntil: 0, commentBanUntil: 0, photoBanUntil: 0, reason: '' }

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

function mapScope(data: Record<string, unknown> | undefined): UserSanctionScopeState {
  if (!data) return { ...EMPTY_SCOPE }
  return {
    bannedUntil: (data.bannedUntil as number) || 0,
    commentBanUntil: (data.commentBanUntil as number) || 0,
    photoBanUntil: (data.photoBanUntil as number) || 0,
    reason: (data.reason as string) || '',
  }
}

function mapSummary(uid: string, data: Record<string, unknown> | undefined): UserSanctionSummary {
  const events: Record<string, UserSanctionScopeState> = {}
  const rawEvents = (data?.events as Record<string, Record<string, unknown>>) || {}
  for (const [eventId, scope] of Object.entries(rawEvents)) events[eventId] = mapScope(scope)
  return {
    uid,
    warningsCount: (data?.warningsCount as number) || 0,
    global: mapScope(data?.global as Record<string, unknown>),
    events,
    updatedAt: toMillis(data?.updatedAt),
  }
}

export async function getUserSanctionSummary(uid: string): Promise<UserSanctionSummary> {
  const snap = await getDoc(doc(db, 'sanctions', uid))
  return mapSummary(uid, snap.exists() ? snap.data() : undefined)
}

export function subscribeToUserSanctionSummary(
  uid: string,
  callback: (summary: UserSanctionSummary) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'sanctions', uid),
    (snap) => callback(mapSummary(uid, snap.exists() ? snap.data() : undefined)),
    onError,
  )
}

export function isCurrentlyBanned(summary: UserSanctionSummary, eventId?: string): boolean {
  const now = Date.now()
  if (summary.global.bannedUntil > now) return true
  return !!(eventId && summary.events[eventId]?.bannedUntil > now)
}

export function isCommentRestricted(summary: UserSanctionSummary, eventId?: string): boolean {
  if (isCurrentlyBanned(summary, eventId)) return true
  const now = Date.now()
  if (summary.global.commentBanUntil > now) return true
  return !!(eventId && summary.events[eventId]?.commentBanUntil > now)
}

export function isPhotoRestricted(summary: UserSanctionSummary, eventId?: string): boolean {
  if (isCurrentlyBanned(summary, eventId)) return true
  const now = Date.now()
  if (summary.global.photoBanUntil > now) return true
  return !!(eventId && summary.events[eventId]?.photoBanUntil > now)
}

// Fecha (o "permanente") en la que vence la restricción activa más relevante
// para mostrarle al usuario un mensaje claro sin exponerle el modelo interno.
export function activeRestrictionUntilLabel(until: number): string {
  if (until >= PERMANENT_SANCTION_MS) return 'de forma permanente'
  return `hasta el ${new Date(until).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}`
}

export interface ApplySanctionInput {
  targetUid: string
  type: SanctionType
  scope: SanctionScope
  eventId?: string
  eventName?: string
  durationMs: number | null // null = permanente
  reason: string
  adminUid: string
  adminEmail: string | null
  reportId?: string
}

const FIELD_BY_TYPE: Partial<Record<SanctionType, keyof UserSanctionScopeState>> = {
  ban: 'bannedUntil',
  suspension: 'bannedUntil',
  comment_restriction: 'commentBanUntil',
  photo_restriction: 'photoBanUntil',
}

function durationLabel(durationMs: number | null): string {
  if (durationMs === null) return 'permanente'
  const days = Math.round(durationMs / (24 * 60 * 60 * 1000))
  if (days >= 1) return `${days} día${days === 1 ? '' : 's'}`
  const hours = Math.max(1, Math.round(durationMs / (60 * 60 * 1000)))
  return `${hours} hora${hours === 1 ? '' : 's'}`
}

// Aplica una sanción y dos escrituras atómicas: el resumen usado por
// firestore.rules / la UI para bloquear en tiempo real (sanctions/{uid}), y
// una entrada de auditoría en el historial (sanctions/{uid}/history). Se
// hace en un solo batch para que nunca quede una sin la otra.
export async function applySanction(input: ApplySanctionInput): Promise<void> {
  const summary = await getUserSanctionSummary(input.targetUid)
  const expiresAt = input.type === 'warning'
    ? 0
    : input.durationMs === null
      ? PERMANENT_SANCTION_MS
      : Date.now() + input.durationMs

  const batch = writeBatch(db)
  const summaryRef = doc(db, 'sanctions', input.targetUid)

  if (input.type === 'warning') {
    batch.set(summaryRef, { warningsCount: summary.warningsCount + 1, updatedAt: serverTimestamp() }, { merge: true })
  } else {
    const field = FIELD_BY_TYPE[input.type]
    if (!field) throw new Error('Tipo de sanción no soportado.')
    if (input.scope === 'global') {
      const nextGlobal = { ...summary.global, [field]: expiresAt, reason: input.reason }
      batch.set(summaryRef, { global: nextGlobal, updatedAt: serverTimestamp() }, { merge: true })
    } else {
      if (!input.eventId) throw new Error('Falta el evento para una sanción a nivel de evento.')
      const currentEventScope = summary.events[input.eventId] || { ...EMPTY_SCOPE }
      const nextEventScope = { ...currentEventScope, [field]: expiresAt, reason: input.reason }
      batch.set(summaryRef, { events: { [input.eventId]: nextEventScope }, updatedAt: serverTimestamp() }, { merge: true })
    }
  }

  const historyRef = doc(collection(db, 'sanctions', input.targetUid, 'history'))
  batch.set(historyRef, {
    type: input.type,
    scope: input.scope,
    eventId: input.eventId || null,
    eventName: input.eventName || null,
    reason: input.reason,
    durationMs: input.durationMs,
    expiresAt: input.type === 'warning' ? null : expiresAt,
    adminUid: input.adminUid,
    adminEmail: input.adminEmail,
    reportId: input.reportId || null,
    createdAt: serverTimestamp(),
  })

  await batch.commit()

  if (input.reportId) {
    const scopeLabel = input.scope === 'global' ? 'toda la app' : `el evento "${input.eventName || input.eventId}"`
    await appendReportSanctionAction(
      input.reportId,
      { adminUid: input.adminUid, adminEmail: input.adminEmail },
      `Aplicó "${SANCTION_TYPE_LABELS[input.type]}" (${durationLabel(input.durationMs)}, ${scopeLabel}).`,
    )
  }
}

export interface RevokeSanctionInput {
  targetUid: string
  type: Exclude<SanctionType, 'warning'>
  scope: SanctionScope
  eventId?: string
  eventName?: string
  adminUid: string
  adminEmail: string | null
  reportId?: string
}

export async function revokeSanction(input: RevokeSanctionInput): Promise<void> {
  const summary = await getUserSanctionSummary(input.targetUid)
  const field = FIELD_BY_TYPE[input.type]
  if (!field) throw new Error('Tipo de sanción no soportado.')

  const batch = writeBatch(db)
  const summaryRef = doc(db, 'sanctions', input.targetUid)

  if (input.scope === 'global') {
    const nextGlobal = { ...summary.global, [field]: 0 }
    batch.set(summaryRef, { global: nextGlobal, updatedAt: serverTimestamp() }, { merge: true })
  } else {
    if (!input.eventId) throw new Error('Falta el evento para revertir una sanción a nivel de evento.')
    const currentEventScope = summary.events[input.eventId] || { ...EMPTY_SCOPE }
    const nextEventScope = { ...currentEventScope, [field]: 0 }
    batch.set(summaryRef, { events: { [input.eventId]: nextEventScope }, updatedAt: serverTimestamp() }, { merge: true })
  }

  const historyRef = doc(collection(db, 'sanctions', input.targetUid, 'history'))
  batch.set(historyRef, {
    type: 'revoked',
    scope: input.scope,
    eventId: input.eventId || null,
    eventName: input.eventName || null,
    reason: `Se revirtió: ${SANCTION_TYPE_LABELS[input.type]}`,
    durationMs: null,
    expiresAt: null,
    adminUid: input.adminUid,
    adminEmail: input.adminEmail,
    reportId: input.reportId || null,
    createdAt: serverTimestamp(),
  })

  await batch.commit()

  if (input.reportId) {
    const scopeLabel = input.scope === 'global' ? 'toda la app' : `el evento "${input.eventName || input.eventId}"`
    await appendReportSanctionAction(
      input.reportId,
      { adminUid: input.adminUid, adminEmail: input.adminEmail },
      `Revirtió "${SANCTION_TYPE_LABELS[input.type]}" (${scopeLabel}).`,
      'sanction_revoked',
    )
  }
}

export async function getUserSanctionHistory(uid: string, limitN = 50): Promise<SanctionHistoryEntry[]> {
  const q = query(collection(db, 'sanctions', uid, 'history'), orderBy('createdAt', 'desc'), limit(limitN))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      type: data.type as SanctionHistoryEntry['type'],
      scope: data.scope as SanctionScope,
      eventId: (data.eventId as string) || null,
      eventName: (data.eventName as string) || null,
      reason: (data.reason as string) || '',
      durationMs: (data.durationMs as number) ?? null,
      expiresAt: (data.expiresAt as number) ?? null,
      adminUid: data.adminUid as string,
      adminEmail: (data.adminEmail as string) || null,
      reportId: (data.reportId as string) || null,
      createdAt: toMillis(data.createdAt),
    }
  })
}
