import { useEffect, useMemo, useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useEventOnly } from './useEventOnly'
import { subscribeToRecentCheckins } from '../firebase/reports'
import type { CheckinLog } from '../types'

const RECENT_CHECKINS_LIMIT = 50
// Única métrica de esta pantalla que no es en vivo: un aggregation query
// (getCountFromServer) cuenta sin descargar documentos, pero Firestore no
// ofrece un listener de agregación — se refresca por polling, no por
// realtime, trade-off explícito para no bajar la lista completa de
// invitados en un evento de miles solo para contar cuántos son VIP.
const VIP_COUNT_POLL_MS = 30_000

export function useHostLiveDashboard(eventId: string | undefined) {
  const { event, loading, error } = useEventOnly(eventId)
  const [recentCheckins, setRecentCheckins] = useState<CheckinLog[]>([])
  const [vipCount, setVipCount] = useState<number | null>(null)

  useEffect(() => {
    if (!eventId) return
    return subscribeToRecentCheckins(eventId, RECENT_CHECKINS_LIMIT, setRecentCheckins)
  }, [eventId])

  const vipTagId = event?.vipTagId
  useEffect(() => {
    if (!eventId || !vipTagId) return
    let cancelled = false
    async function loadVipCount() {
      try {
        const q = query(
          collection(db, 'events', eventId as string, 'guests'),
          where('tags', 'array-contains', vipTagId),
        )
        const snap = await getCountFromServer(q)
        if (!cancelled) setVipCount(snap.data().count)
      } catch {
        // Un coanfitrión con viewLiveDashboard pero sin viewGuestList no
        // tiene permiso de leer la subcolección `guests` (ni siquiera en
        // agregado) — se oculta la tarjeta en vez de romper el resto del
        // dashboard.
        if (!cancelled) setVipCount(null)
      }
    }
    loadVipCount()
    const interval = setInterval(loadVipCount, VIP_COUNT_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [eventId, vipTagId])

  const arrivals = useMemo(() => recentCheckins.filter((c) => c.type === 'check_in'), [recentCheckins])
  const rejected = useMemo(() => recentCheckins.filter((c) => c.type === 'entry_blocked'), [recentCheckins])

  // Personas invitadas que nunca hicieron check-in — checkedInCount es
  // asistencia ACUMULADA (no baja si alguien sale), así que resta bien contra
  // peopleCount sin verse afectado por salidas temporales/definitivas.
  const pendingCount = event ? Math.max(event.peopleCount - event.checkedInCount, 0) : 0
  const occupancyPercent = event && event.capacity > 0
    ? Math.min(Math.round((event.occupancyCount / event.capacity) * 100), 100)
    : null

  return {
    event,
    loading,
    error,
    recentCheckins,
    arrivals,
    rejected,
    // null en cuanto no hay vipTagId configurado (aunque quede un valor
    // stale de una etiqueta anterior en el state) — evita el setState
    // síncrono al inicio del efecto de arriba.
    vipCount: vipTagId ? vipCount : null,
    pendingCount,
    occupancyPercent,
  }
}
