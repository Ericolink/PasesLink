import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './config'
import { AD_PLACEMENTS, type AdPlacement } from '../types/ads'

// Doc singleton platformConfig/maintenance — único punto de control del modo
// mantenimiento (ver src/hooks/useMaintenanceMode.ts, MaintenanceGate.tsx y
// MaintenanceModePanel.tsx). `message` siempre viaja como string (nunca
// ausente/null) para que la regla de Firestore lo valide con una sola
// condición fija; string vacío significa "usar el copy por defecto".
export async function setMaintenanceMode(uid: string, enabled: boolean, message: string): Promise<void> {
  await setDoc(doc(db, 'platformConfig', 'maintenance'), {
    enabled,
    message: message.trim(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}

// Doc singleton platformConfig/ads — único punto de control de la
// publicidad (ver src/hooks/useAdsConfig.ts, src/components/ads/AdSlot.tsx y
// AdsPanel.tsx). Mismo patrón que maintenance: `enabled` es el apagador
// global, `placements` permite apagar un placement individual sin tocar los
// demás. Siempre escribe los 2 placements conocidos (nunca un subconjunto)
// para que la regla de Firestore valide un shape fijo.
export async function setAdsConfig(uid: string, enabled: boolean, placements: Record<AdPlacement, boolean>): Promise<void> {
  await setDoc(doc(db, 'platformConfig', 'ads'), {
    enabled,
    placements: Object.fromEntries(AD_PLACEMENTS.map((p) => [p, placements[p] === true])),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  })
}
