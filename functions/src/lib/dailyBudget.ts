// Presupuesto diario compartido de envíos de email — portado de
// scripts/lib/dailyBudget.mjs sin cambios de contrato. El cap de 300/día de
// Brevo es de CUENTA, compartido entre todos los flujos de email de Cloud
// Functions (waitlist, reconfirmación, recordatorios de RSVP, mensajería
// masiva — ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md), así que todos
// consumen del mismo documento `sendBudget/{YYYY-MM-DD}`.
import type { Firestore } from 'firebase-admin/firestore'

export const DAILY_BUDGET_CAP = 300

// Techo de mensajes de WhatsApp por día — a diferencia del cap de Brevo
// (300/día gratis, tope de CANTIDAD), acá el techo real es de COSTO: cada
// plantilla enviada se cobra (ver WAITLIST_RECONFIRMATION_ARCHITECTURE.md
// §10.5). 50/día es un punto de partida conservador mientras no hay datos
// reales de uso — se reserva con el mismo `reserveBudgetSlot` de acá abajo,
// namespacing la key del día (`${fecha}_whatsapp`) para no compartir cupo
// con el de email. Ajustar una vez que haya volumen real.
export const WHATSAPP_DAILY_BUDGET_CAP = 50

export function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function reserveBudgetSlot(db: Firestore, dateKey: string, cap: number): Promise<boolean> {
  const ref = db.collection('sendBudget').doc(dateKey)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const count = snap.exists ? ((snap.data()?.count as number) ?? 0) : 0
    if (count >= cap) return false
    tx.set(ref, { count: count + 1 }, { merge: true })
    return true
  })
}
