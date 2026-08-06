// Cloud Functions v2 de PaseLink. Código standalone: no importa nada de
// `src/` (mismo criterio ya establecido para scripts/*.mjs — runtimes
// distintos, evita arrastrar código de navegador a Node). Los exports de
// cada feature se agregan acá a medida que se implementan (ver
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md para la primera).
import { initializeApp, getApps } from 'firebase-admin/app'

if (getApps().length === 0) {
  initializeApp()
}

export { onCapacityFreed } from './triggers/onCapacityFreed.js'
export { onAdminWritten } from './triggers/onAdminWritten.js'
export { onGuestWritten } from './triggers/onGuestWritten.js'
export { onNotificationQueued } from './triggers/onNotificationQueued.js'
export { onMessageCampaignQueued } from './triggers/onMessageCampaignQueued.js'
export { onUserCreated } from './triggers/onUserCreated.js'
export { onReportCreated } from './triggers/onReportCreated.js'
export { confirmWaitlistOffer } from './callable/confirmWaitlistOffer.js'
export { declineWaitlistOffer } from './callable/declineWaitlistOffer.js'
export { promoteWaitlistEntry } from './callable/promoteWaitlistEntry.js'
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
export { createConcessionOrder } from './callable/createConcessionOrder.js'
export { cancelConcessionOrder } from './callable/cancelConcessionOrder.js'
export { backupFirestoreDaily } from './scheduled/backupFirestoreDaily.js'
export { backupFirestoreWeekly } from './scheduled/backupFirestoreWeekly.js'
export { backupFirestoreMonthly } from './scheduled/backupFirestoreMonthly.js'
