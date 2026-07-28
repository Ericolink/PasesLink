// Presupuesto diario compartido de envíos de email — el cap de 300/día de
// Brevo es de CUENTA, y dos scripts independientes (recordatorios +
// mensajería masiva) pueden correr el mismo día, así que ambos necesitan
// consumir del mismo contador. Documento `sendBudget/{YYYY-MM-DD}` con
// `{count}`, incrementado dentro de una transacción para que dos workers
// concurrentes nunca se pasen del tope.
export function todayDateKey() {
  return new Date().toISOString().slice(0, 10)
}

export async function reserveBudgetSlot(db, dateKey, cap) {
  const ref = db.collection('sendBudget').doc(dateKey)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const count = snap.exists ? snap.data().count || 0 : 0
    if (count >= cap) return false
    tx.set(ref, { count: count + 1 }, { merge: true })
    return true
  })
}
