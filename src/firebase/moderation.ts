import {
  arrayUnion,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
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
import { deleteWallMessage } from './wall'
import { deletePhoto } from './photos'
import {
  REPORT_CONTENT_SNAPSHOT_MAX,
  REPORT_EVENT_NAME_MAX,
  REPORT_NAME_MAX,
  REPORT_REASON_MAX,
  REPORT_REASON_MIN,
  requireMaxLength,
  requireMinLength,
  sanitizeFeedbackText,
} from '../utils/validation'
import type { ContentReport, ReportActionEntry, ReportedContentType, ReportStatus } from '../types'

export const DEFAULT_REPORTS_LIVE_LIMIT = 50

// Ventana anti-spam: sin esto un usuario logueado podría disparar decenas de
// reportes por segundo. 20s alcanza para reportar contenido distinto sin
// fricción, pero corta un doble-click o un script que reintente en bucle.
const REPORT_COOLDOWN_MS = 20_000
// Reporte duplicado: mismo usuario + mismo contenido dentro de esta ventana.
// Pasado este tiempo, un reporte nuevo sobre el mismo contenido sí se acepta
// (puede haber reaparecido con contexto distinto, o el admin ya resolvió el
// caso anterior y el contenido sigue publicado).
const REPORT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

export interface CreateReportInput {
  eventId: string
  eventName: string
  contentType: ReportedContentType
  contentId: string
  contentSnapshot: string
  contentCaption?: string
  contentAuthorName: string
  contentAuthorToken: string
  reporterUid: string
  reporterName: string
  reporterEmail: string | null
  anonymous: boolean
  reason: string
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

function mapReport(id: string, data: Record<string, unknown>): ContentReport {
  return {
    id,
    eventId: (data.eventId as string) || '',
    eventName: (data.eventName as string) || '',
    contentType: (data.contentType as ReportedContentType) || 'comment',
    contentId: (data.contentId as string) || '',
    contentSnapshot: (data.contentSnapshot as string) || '',
    contentCaption: (data.contentCaption as string) || undefined,
    contentAuthorName: (data.contentAuthorName as string) || '',
    contentAuthorToken: (data.contentAuthorToken as string) || '',
    contentAuthorUid: (data.contentAuthorUid as string) || null,
    reporterUid: (data.reporterUid as string) || '',
    reporterName: (data.reporterName as string) || '',
    reporterEmail: (data.reporterEmail as string) || null,
    anonymous: (data.anonymous as boolean) || false,
    reason: (data.reason as string) || '',
    status: (data.status as ReportStatus) || 'pending',
    adminNotes: (data.adminNotes as string) || '',
    actionHistory: (data.actionHistory as ReportActionEntry[]) || [],
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
}

// Intenta resolver si el autor del contenido reportado tiene una cuenta real
// (authorToken == uid de Firebase cuando el que publicó estaba logueado — ver
// src/firebase/wall.ts y src/firebase/photos.ts). Los invitados anónimos usan
// un token generado (nombre o UUID) que nunca coincide con un documento en
// /users, así que esto resuelve a null sin falsos positivos.
async function resolveContentAuthorUid(authorToken: string): Promise<string | null> {
  if (!authorToken) return null
  try {
    const snap = await getDoc(doc(db, 'users', authorToken))
    return snap.exists() ? authorToken : null
  } catch {
    return null
  }
}

export async function createReport(input: CreateReportInput): Promise<string> {
  const reason = requireMaxLength(
    requireMinLength(sanitizeFeedbackText(input.reason), REPORT_REASON_MIN, 'La razón del reporte'),
    REPORT_REASON_MAX,
    'La razón del reporte',
  )
  const contentSnapshot = requireMaxLength(input.contentSnapshot, REPORT_CONTENT_SNAPSHOT_MAX, 'El contenido reportado')
  const contentAuthorName = requireMaxLength(input.contentAuthorName, REPORT_NAME_MAX, 'El nombre del autor')
  const eventName = requireMaxLength(input.eventName, REPORT_EVENT_NAME_MAX, 'El nombre del evento')
  const reporterName = requireMaxLength(input.reporterName, REPORT_NAME_MAX, 'Tu nombre')

  const contentAuthorUid = await resolveContentAuthorUid(input.contentAuthorToken)

  const rateLimitRef = doc(db, 'reportRateLimits', input.reporterUid)
  const dedupRef = doc(db, 'reportDedup', input.reporterUid, 'targets', input.contentId)
  const reportRef = doc(collection(db, 'reports'))

  await runTransaction(db, async (transaction) => {
    const [rlSnap, dedupSnap] = await Promise.all([transaction.get(rateLimitRef), transaction.get(dedupRef)])

    const lastAt = rlSnap.exists() ? (rlSnap.data().lastAt as Timestamp | undefined) : undefined
    if (lastAt && Date.now() - lastAt.toMillis() < REPORT_COOLDOWN_MS) {
      throw new Error('Espera un momento antes de enviar otro reporte.')
    }
    const dedupAt = dedupSnap.exists() ? (dedupSnap.data().lastAt as Timestamp | undefined) : undefined
    if (dedupAt && Date.now() - dedupAt.toMillis() < REPORT_DEDUP_WINDOW_MS) {
      throw new Error('Ya reportaste este contenido recientemente. Nuestro equipo ya fue notificado.')
    }

    transaction.set(reportRef, {
      eventId: input.eventId,
      eventName,
      contentType: input.contentType,
      contentId: input.contentId,
      contentSnapshot,
      contentCaption: input.contentCaption || '',
      contentAuthorName,
      contentAuthorToken: input.contentAuthorToken,
      contentAuthorUid,
      reporterUid: input.reporterUid,
      reporterName,
      reporterEmail: input.reporterEmail,
      anonymous: input.anonymous,
      reason,
      status: 'pending' as ReportStatus,
      adminNotes: '',
      actionHistory: [] as ReportActionEntry[],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    transaction.set(rateLimitRef, { lastAt: serverTimestamp() })
    transaction.set(dedupRef, { lastAt: serverTimestamp() })
  })

  return reportRef.id
}

// Mismo criterio "ventana reciente + histórico a pedido" que wall.ts — pensado
// para escalar a miles de reportes sin descargar la colección completa en
// cada carga del panel de admin. `statusFilter` permite acotar la ventana en
// vivo a, por ejemplo, solo "pendiente" — la vista por defecto del admin — en
// vez de traer también los ya resueltos/rechazados que rara vez necesita ver.
export function subscribeToRecentReports(
  callback: (reports: ContentReport[]) => void,
  onError?: (error: Error) => void,
  liveLimit: number = DEFAULT_REPORTS_LIVE_LIMIT,
  statusFilter?: ReportStatus,
): Unsubscribe {
  const constraints = statusFilter
    ? [where('status', '==', statusFilter), orderBy('createdAt', 'desc'), limit(liveLimit)]
    : [orderBy('createdAt', 'desc'), limit(liveLimit)]
  const q = query(collection(db, 'reports'), ...constraints)
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => mapReport(d.id, d.data()))), onError)
}

export async function getOlderReports(
  beforeCreatedAt: number,
  pageSize: number = DEFAULT_REPORTS_LIVE_LIMIT,
  statusFilter?: ReportStatus,
): Promise<{ reports: ContentReport[]; hasMore: boolean }> {
  const constraints = statusFilter
    ? [where('status', '==', statusFilter), orderBy('createdAt', 'desc'), where('createdAt', '<', Timestamp.fromMillis(beforeCreatedAt)), limit(pageSize + 1)]
    : [orderBy('createdAt', 'desc'), where('createdAt', '<', Timestamp.fromMillis(beforeCreatedAt)), limit(pageSize + 1)]
  const q = query(collection(db, 'reports'), ...constraints)
  const snap = await getDocs(q)
  const reports = snap.docs.slice(0, pageSize).map((d) => mapReport(d.id, d.data()))
  return { reports, hasMore: snap.docs.length > pageSize }
}

// Lectura puntual por id — usada para abrir el detalle desde el link directo
// del correo de aviso (ver sendReportNotificationEmail), que puede apuntar a
// un reporte más viejo que la ventana en vivo cargada en el panel.
export async function getReportById(reportId: string): Promise<ContentReport | null> {
  const snap = await getDoc(doc(db, 'reports', reportId))
  return snap.exists() ? mapReport(snap.id, snap.data()) : null
}

// Conteo barato (sin descargar los documentos) de cuántas veces se reportó
// el mismo contenido — se muestra en el detalle del reporte para el admin.
export async function getReportCountForContent(contentId: string): Promise<number> {
  const q = query(collection(db, 'reports'), where('contentId', '==', contentId))
  const snap = await getCountFromServer(q)
  return snap.data().count
}

// Historial de reportes recibidos por el contenido de un usuario — lo que el
// admin ve como "historial de reportes del usuario" al moderar un caso.
export async function getReportsAboutUser(uid: string, limitN = 50): Promise<ContentReport[]> {
  const q = query(
    collection(db, 'reports'),
    where('contentAuthorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(limitN),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapReport(d.id, d.data()))
}

function newActionEntry(
  type: ReportActionEntry['type'],
  adminUid: string,
  adminEmail: string | null,
  detail: string,
): ReportActionEntry {
  return { id: crypto.randomUUID(), type, adminUid, adminEmail, detail, createdAt: Date.now() }
}

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  admin: { adminUid: string; adminEmail: string | null },
  statusLabel: string,
): Promise<void> {
  await updateDoc(doc(db, 'reports', reportId), {
    status,
    updatedAt: serverTimestamp(),
    actionHistory: arrayUnion(newActionEntry('status_change', admin.adminUid, admin.adminEmail, `Cambió el estado a "${statusLabel}".`)),
  })
}

export async function saveReportNotes(
  reportId: string,
  adminNotes: string,
  admin: { adminUid: string; adminEmail: string | null },
): Promise<void> {
  await updateDoc(doc(db, 'reports', reportId), {
    adminNotes,
    updatedAt: serverTimestamp(),
    actionHistory: arrayUnion(newActionEntry('note', admin.adminUid, admin.adminEmail, 'Actualizó las notas internas.')),
  })
}

// Elimina el contenido reportado (comentario o foto) y deja constancia en el
// historial de acciones del reporte — no cambia el estado del reporte por su
// cuenta, el admin decide por separado si lo marca resuelto.
export async function deleteReportedContent(
  report: ContentReport,
  admin: { adminUid: string; adminEmail: string | null },
): Promise<void> {
  if (report.contentType === 'comment') {
    await deleteWallMessage(report.eventId, report.contentId)
  } else {
    await deletePhoto(report.eventId, report.contentId)
  }
  await updateDoc(doc(db, 'reports', report.id), {
    updatedAt: serverTimestamp(),
    actionHistory: arrayUnion(
      newActionEntry(
        'content_deleted',
        admin.adminUid,
        admin.adminEmail,
        report.contentType === 'comment' ? 'Eliminó el comentario reportado.' : 'Eliminó la fotografía reportada.',
      ),
    ),
  })
}

export async function appendReportSanctionAction(
  reportId: string,
  admin: { adminUid: string; adminEmail: string | null },
  detail: string,
  type: 'sanction_applied' | 'sanction_revoked' = 'sanction_applied',
): Promise<void> {
  await updateDoc(doc(db, 'reports', reportId), {
    updatedAt: serverTimestamp(),
    actionHistory: arrayUnion(newActionEntry(type, admin.adminUid, admin.adminEmail, detail)),
  })
}
