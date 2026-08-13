// Cloud Functions v2 de PaseLink. Código standalone: no importa nada de
// `src/` (mismo criterio ya establecido para scripts/*.mjs — runtimes
// distintos, evita arrastrar código de navegador a Node). Los exports de
// cada feature se agregan acá a medida que se implementan (ver
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md para la primera).
import { initializeApp, getApps } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'

if (getApps().length === 0) {
  initializeApp()
}

// Configuración por defecto de toda función que no la pise explícitamente
// (ver CLOUD_FUNCTIONS_SIZING.md para el análisis completo función por
// función). region: misma ubicación que la base de Firestore (us-central1,
// confirmado con `firebase firestore:databases:get`) — evita latencia
// cross-region en cada get()/runTransaction(). memory: 256MiB — NINGUNA
// función de este proyecto baja de acá, ni las más livianas (un solo
// update() o un email): con un solo codebase, el contenedor de CUALQUIER
// función carga el módulo completo del proyecto al arrancar (todos los
// triggers/callables/scheduled, no solo el código propio de esa función), y
// bajar la memoria de una función puntual a 128MiB rompió ese cold start —
// Cloud Run rechazaba el healthcheck antes de terminar de cargar (ver el
// mismo comentario en getOfferedWaitlistCount.ts, primer caso encontrado).
// timeoutSeconds: 60 (el default real de Cloud Functions) en vez del máximo
// por función — cada función que hace trabajo genuinamente largo (barridos,
// altas masivas, envío de campañas) lo sube de forma explícita y
// justificada; ninguna lo baja, por el mismo motivo que la memoria.
// maxInstances: 10 es la red de seguridad para cualquier función sin
// tráfico propio conocido; las que necesitan más headroom (triggers de alta
// frecuencia, altas públicas sin autenticación) lo suben de forma explícita.
// cpu ya es 1 por defecto de firebase-functions (a diferencia de gcloud)
// para memoria <= 2GiB, así que concurrency=80 aplica sin tocar nada —
// seguro acá porque cada función resuelve su propio estado con
// transacciones de Firestore, sin memoria compartida entre invocaciones.
setGlobalOptions({
  region: 'us-central1',
  memory: '256MiB',
  timeoutSeconds: 60,
  maxInstances: 10,
})

export { onCapacityFreed } from './triggers/onCapacityFreed.js'
export { onAdminWritten } from './triggers/onAdminWritten.js'
export { onGuestWritten } from './triggers/onGuestWritten.js'
export { onNotificationQueued } from './triggers/onNotificationQueued.js'
export { onUserCreated } from './triggers/onUserCreated.js'
export { onEventCreated } from './triggers/onEventCreated.js'
export { onReportCreated } from './triggers/onReportCreated.js'
export { confirmWaitlistOffer } from './callable/confirmWaitlistOffer.js'
export { declineWaitlistOffer } from './callable/declineWaitlistOffer.js'
export { promoteWaitlistEntry } from './callable/promoteWaitlistEntry.js'
export { assignWaitlistSpot } from './callable/assignWaitlistSpot.js'
export { cancelWaitlistOffer } from './callable/cancelWaitlistOffer.js'
export { getOfferedWaitlistCount } from './callable/getOfferedWaitlistCount.js'
export { startReconfirmCampaign } from './callable/startReconfirmCampaign.js'
export { sweepReconfirmations } from './scheduled/sweepReconfirmations.js'
export { sendRsvpReminders } from './scheduled/sendRsvpReminders.js'
export { reconcileGuestCounters } from './scheduled/reconcileGuestCounters.js'
export { reconcileDirtyCounters } from './scheduled/reconcileDirtyGuestCounters.js'
export { reconcileShardedCounters } from './scheduled/reconcileShardedCounters.js'
export { setGuestPaymentStatus } from './callable/setGuestPaymentStatus.js'
export { bulkSetGuestPaymentStatus } from './callable/bulkSetGuestPaymentStatus.js'
export { checkInGuest } from './callable/checkInGuest.js'
export { checkOutGuest } from './callable/checkOutGuest.js'
export { confirmPaymentAndCheckIn } from './callable/confirmPaymentAndCheckIn.js'
export { allowGuestReentry } from './callable/allowGuestReentry.js'
export { registerWalkInGuest } from './callable/registerWalkInGuest.js'
export { addGuest } from './callable/addGuest.js'
export { addGuestsBulk } from './callable/addGuestsBulk.js'
export { createCoOrganizerInvite } from './callable/createCoOrganizerInvite.js'
export { acceptCoOrganizerInvite } from './callable/acceptCoOrganizerInvite.js'
export { createConcessionsStaffInvite } from './callable/createConcessionsStaffInvite.js'
export { acceptConcessionsStaffInvite } from './callable/acceptConcessionsStaffInvite.js'
export { createCollaboratorInvite } from './callable/createCollaboratorInvite.js'
export { acceptCollaboratorInvite } from './callable/acceptCollaboratorInvite.js'
export { deleteAccount } from './callable/deleteAccount.js'
export { startCsvImport } from './callable/startCsvImport.js'
export { cancelCsvImportJob } from './callable/cancelCsvImportJob.js'
export { processCsvImportChunk } from './tasks/processCsvImportChunk.js'
export { createConcessionOrder } from './callable/createConcessionOrder.js'
export { cancelConcessionOrder } from './callable/cancelConcessionOrder.js'
export { deleteConcessionOrder } from './callable/deleteConcessionOrder.js'
export { sweepAbandonedConcessionOrders } from './scheduled/sweepAbandonedConcessionOrders.js'
export { backupFirestoreDaily } from './scheduled/backupFirestoreDaily.js'
export { backupFirestoreWeekly } from './scheduled/backupFirestoreWeekly.js'
export { backupFirestoreMonthly } from './scheduled/backupFirestoreMonthly.js'
export { refreshPlatformHealth } from './scheduled/refreshPlatformHealth.js'
export { whatsappWebhook } from './http/whatsappWebhook.js'
export { eventJoinMeta } from './http/eventJoinMeta.js'
