import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './config'

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
