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
export { confirmWaitlistOffer } from './callable/confirmWaitlistOffer.js'
export { declineWaitlistOffer } from './callable/declineWaitlistOffer.js'
export { promoteWaitlistEntry } from './callable/promoteWaitlistEntry.js'
export { cancelWaitlistOffer } from './callable/cancelWaitlistOffer.js'
export { getOfferedWaitlistCount } from './callable/getOfferedWaitlistCount.js'
export { startReconfirmCampaign } from './callable/startReconfirmCampaign.js'
export { sweepReconfirmations } from './scheduled/sweepReconfirmations.js'
