import { useEffect, useState } from 'react'
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { withListenerReporting } from '../lib/sentry'
import { AD_PLACEMENTS, type AdPlacement } from '../types/ads'

export interface AdsConfigState {
  enabled: boolean
  placements: Record<AdPlacement, boolean>
  updatedAt: Timestamp | null
}

const ALL_OFF = Object.fromEntries(AD_PLACEMENTS.map((p) => [p, false])) as Record<AdPlacement, boolean>
const DEFAULT_STATE: AdsConfigState = { enabled: false, placements: ALL_OFF, updatedAt: null }

// Único punto de lectura de la config de publicidad (platformConfig/ads en
// firestore.rules). Igual que useMaintenanceMode: arranca en "todo apagado"
// y se queda así si el doc no existe todavía o si la lectura falla — un
// error acá nunca debe traducirse en anuncios apareciendo sin que nadie los
// haya activado a propósito. Con esto activado en Firestore, todas las
// pestañas abiertas lo reflejan sin poll (listener en tiempo real).
export function useAdsConfig(): AdsConfigState {
  const [state, setState] = useState<AdsConfigState>(DEFAULT_STATE)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'platformConfig', 'ads'),
      (snap) => {
        const data = snap.data()
        const rawPlacements = (data?.placements ?? {}) as Record<string, unknown>
        setState({
          enabled: data?.enabled === true,
          placements: Object.fromEntries(AD_PLACEMENTS.map((p) => [p, rawPlacements[p] === true])) as Record<AdPlacement, boolean>,
          updatedAt: (data?.updatedAt as Timestamp | undefined) ?? null,
        })
      },
      withListenerReporting('ads-config', () => setState(DEFAULT_STATE)),
    )
    return unsubscribe
  }, [])

  return state
}
