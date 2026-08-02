// Aviso al admin de un reporte de contenido — puerto de
// sendReportNotificationEmail (antes en src/utils/emailjs.ts, client-side)
// a un trigger de Firestore sobre la creación de reports/{reportId}. El
// reporte ya se guarda en Firestore antes de esto (createReport,
// src/firebase/moderation.ts) — un fallo acá nunca debe impedir que el
// reporte quede guardado, por diseño ya es así: el trigger corre DESPUÉS
// de que el documento existe. Ver
// NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 4.
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { sendEmail } from '../lib/emailChannel.js'
import { brevoApiKey, brevoSenderEmail, reportAdminEmail } from '../lib/secrets.js'
import { withTriggerObservability } from '../lib/observability/withObservability.js'

// Mismo mapeo que REPORT_CONTENT_TYPE_LABELS (src/types/index.ts) — se
// repite acá en vez de compartirse porque functions/src nunca importa de
// src/ (convención ya establecida, ver functions/src/index.ts).
const CONTENT_TYPE_LABELS: Record<string, string> = {
  comment: 'Comentario',
  photo: 'Fotografía',
}

interface ReportData {
  eventId?: string
  eventName?: string
  contentType?: string
  contentAuthorName?: string
  reporterName?: string
  anonymous?: boolean
  reason?: string
}

export async function sendReportNotificationEmail(
  db: Firestore,
  reportRef: DocumentReference,
  report: ReportData,
): Promise<void> {
  const adminEmail = process.env.REPORT_ADMIN_EMAIL
  if (!adminEmail || !report.eventId) return

  const logRef = db.collection('events').doc(report.eventId).collection('sendLog').doc(`report_${reportRef.id}`)
  try {
    await logRef.create({
      guestId: null,
      channel: 'email',
      kind: 'report_notification',
      toEmail: adminEmail,
      status: 'processing',
      sentAt: new Date(),
    })
  } catch {
    return
  }

  const reporterLabel = report.anonymous ? 'Anónimo' : (report.reporterName || 'Anónimo')
  const contentTypeLabel = CONTENT_TYPE_LABELS[report.contentType || ''] || report.contentType || 'Contenido'
  const adminUrl = `https://www.paselink.com/admin?tab=reports&reportId=${reportRef.id}`

  const result = await sendEmail({
    toEmail: adminEmail,
    subject: `Nuevo reporte en ${report.eventName || 'un evento'}`,
    html: `<p>Se reportó contenido en <strong>${report.eventName || 'un evento'}</strong>.</p>
<p><strong>Tipo:</strong> ${contentTypeLabel}</p>
<p><strong>Autor:</strong> ${report.contentAuthorName || 'desconocido'}</p>
<p><strong>Reportado por:</strong> ${reporterLabel}</p>
<p><strong>Motivo:</strong> ${report.reason || ''}</p>
<p><a href="${adminUrl}">Ver reporte</a></p>`,
  })

  await logRef.update({ status: result.ok ? 'sent' : 'failed' })
}

export const onReportCreated = onDocumentCreated(
  { document: 'reports/{reportId}', secrets: [brevoApiKey, brevoSenderEmail, reportAdminEmail] },
  (event) => withTriggerObservability(event, 'onReportCreated', async () => {
    const snap = event.data
    if (!snap) return
    await sendReportNotificationEmail(getFirestore(), snap.ref, snap.data() as ReportData)
  }),
)
