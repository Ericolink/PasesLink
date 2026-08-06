// Núcleo de "iniciar campaña de reconfirmación" — separado del wrapper de
// Callable (functions/src/callable/startReconfirmCampaign.ts) para poder
// testearlo directo contra el emulador, mismo principio que
// waitlist/cascade.ts.
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import { guestVersionFields } from '../lib/guestVersion.js'

export interface ReminderRuleInput {
  id: string
  daysBeforeDeadline: number
}

export interface StartCampaignInput {
  eventId: string
  deadline: number
  excludeTagIds: string[]
  reminderRules: ReminderRuleInput[]
}

// Firestore permite hasta 500 operaciones por batch — 400 deja margen sin
// acercarse al límite. No hace falta que los guests de un mismo evento se
// repartan en una transacción (cada uno es independiente), así que un
// WriteBatch por chunk alcanza, sin el costo de una transacción real.
const WRITE_CHUNK_SIZE = 400

// Quiénes entran: confirmados (rsvpStatus 'yes') que todavía no pagaron.
// Sin excepciones ni casilla para el organizador — decisión explícita del
// usuario, más simple que el diseño original (que permitía incluir
// pagados): quien ya pagó nunca tiene que reconfirmar.
function isEligible(guest: DocumentData, excludeTagIds: ReadonlySet<string>): boolean {
  if (guest.rsvpStatus !== 'yes') return false
  if (guest.paymentStatus === 'paid') return false
  const tags = (guest.tags as string[] | undefined) ?? []
  if (tags.some((t) => excludeTagIds.has(t))) return false
  return true
}

export async function startCampaign(db: Firestore, input: StartCampaignInput): Promise<{ targeted: number }> {
  const eventRef = db.collection('events').doc(input.eventId)
  const excludeSet = new Set(input.excludeTagIds)

  const guestsSnap = await eventRef.collection('guests').where('rsvpStatus', '==', 'yes').get()
  const eligibleDocs = guestsSnap.docs.filter((d) => isEligible(d.data(), excludeSet))

  let batch = db.batch()
  let opsInBatch = 0
  for (const guestDoc of eligibleDocs) {
    batch.update(guestDoc.ref, { reconfirmStatus: 'requested', reconfirmDeadline: input.deadline, ...guestVersionFields() })
    opsInBatch += 1
    if (opsInBatch >= WRITE_CHUNK_SIZE) {
      await batch.commit()
      batch = db.batch()
      opsInBatch = 0
    }
  }
  if (opsInBatch > 0) await batch.commit()

  await eventRef.update({
    reconfirmCampaign: {
      startedAt: Date.now(),
      deadline: input.deadline,
      ...(input.excludeTagIds.length > 0 ? { excludeTagIds: input.excludeTagIds } : {}),
      reminderRules: input.reminderRules,
    },
  })

  return { targeted: eligibleDocs.length }
}
