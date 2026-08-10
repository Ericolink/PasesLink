import { useEffect, useState } from 'react'
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { withListenerReporting } from '../lib/sentry'

export interface MaintenanceState {
  enabled: boolean
  message: string
  updatedAt: Timestamp | null
}

const DEFAULT_STATE: MaintenanceState = { enabled: false, message: '', updatedAt: null }

// Único punto de lectura del modo mantenimiento (ver platformConfig/maintenance
// en firestore.rules). `enabled` arranca en `false` y se queda así mientras
// no llegue el primer snapshot O si la lectura falla — a propósito: bloquear
// la app entera porque esta única lectura tardó o falló (offline, blip de
// Firestore) sería peor que el problema que el modo mantenimiento intenta
// resolver. El listener queda activo mientras la app vive, así que si un
// admin lo activa, todas las pestañas abiertas lo reflejan solas, sin poll.
export function useMaintenanceMode(): MaintenanceState {
  const [state, setState] = useState<MaintenanceState>(DEFAULT_STATE)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'platformConfig', 'maintenance'),
      (snap) => {
        const data = snap.data()
        setState({
          enabled: data?.enabled === true,
          message: typeof data?.message === 'string' ? data.message : '',
          updatedAt: (data?.updatedAt as Timestamp | undefined) ?? null,
        })
      },
      withListenerReporting('maintenance-config', () => setState(DEFAULT_STATE)),
    )
    return unsubscribe
  }, [])

  return state
}
