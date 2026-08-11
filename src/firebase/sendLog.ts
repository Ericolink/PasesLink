// Bitácora de envíos de email (recordatorios de RSVP, y mensajería masiva
// históricamente) — escrita ÚNICAMENTE por Cloud Functions/scripts Node vía
// firebase-admin, nunca desde el cliente (ver firestore.rules: write:false
// en events/{id}/sendLog/{id}). El panel "Historial de envíos" que leía esta
// colección desde el cliente se quitó del Dashboard del Evento (rediseño);
// `SendLogStatus` se conserva porque src/firebase/adminAlerts.ts todavía lo
// usa para tipar la alerta de "cerca del límite de envío diario".
export type SendLogStatus = 'sent' | 'failed' | 'skipped_no_email' | 'skipped_budget'
