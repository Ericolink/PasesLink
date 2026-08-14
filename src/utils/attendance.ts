// Única fuente de verdad para "% de avance" (asistencia, cupo, o cualquier
// par presente/esperado). Antes cada pantalla reimplementaba su propia
// división — Reports.tsx y AdminDashboard.tsx llegaron a dividir un conteo de
// PERSONAS (checkedInCount, que suma partySize de cada invitado/familia)
// entre un conteo de INVITACIONES (guestCount), lo que mostraba porcentajes
// como 400% en cuanto un invitado tenía acompañantes. Cualquier cálculo de
// porcentaje sobre datos del evento debe pasar por acá, con el par correcto
// (personas contra personas, no personas contra invitaciones).
export function attendancePercent(present: number, expected: number): number {
  if (expected <= 0) return 0
  return Math.min(100, Math.max(0, (present / expected) * 100))
}

export interface PaymentProgress {
  totalPeople: number
  paidPeople: number
  pendingPeople: number
  percent: number
}

// Fuente única de verdad para "personas pagadas/pendientes" (Dashboard,
// Reportes, barra de progreso). `event.paidCount`/`event.peopleCount` ya
// cuentan personas (titular + acompañantes vía partySize), no invitaciones —
// acá solo se deriva el desglose, sin recalcular nada desde `guests`.
// Regresa null en eventos gratuitos: el caller lo usa para no renderizar
// ninguna barra/métrica de pago.
export function paymentProgress(event: {
  requiresPayment: boolean
  peopleCount: number
  paidCount: number
}): PaymentProgress | null {
  if (!event.requiresPayment) return null
  const totalPeople = event.peopleCount
  const paidPeople = event.paidCount ?? 0
  return {
    totalPeople,
    paidPeople,
    pendingPeople: Math.max(0, totalPeople - paidPeople),
    percent: attendancePercent(paidPeople, totalPeople),
  }
}
