import { useEffect, useMemo, useState } from 'react'
import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { subscribeToRecentCheckins } from '../firebase/reports'
import { subscribeToWaitlist } from '../firebase/waitlist'
import { getDashboardStage } from '../utils/eventDashboardStage'
import type { EventPermissions } from '../types/coOrganizerPermissions'
import type { CheckinLog, EventData, WaitlistEntryData } from '../types'

const RECENT_CHECKINS_LIMIT = 50
const RECENT_PACE_WINDOW_MS = 10 * 60 * 1000
// Única métrica de esta pantalla que no es en vivo: un aggregation query
// (getCountFromServer) cuenta sin descargar documentos, pero Firestore no
// ofrece un listener de agregación — se refresca por polling, no por
// realtime (mismo trade-off que ya existía en useHostLiveDashboard).
const VIP_COUNT_POLL_MS = 30_000

// Hook único del dashboard fusionado (Reportes + Anfitrión en Vivo). Recibe
// `event`/`perms` ya resueltos por la página (que mantiene el único
// useEventOnly del dashboard — antes Reportes y Anfitrión en Vivo abrían
// cada uno el suyo) y solo administra las suscripciones SECUNDARIAS, cada
// una montada nada más cuando la etapa actual la necesita — antes, Anfitrión
// en Vivo suscribía el feed de check-ins sin importar si el evento ya había
// empezado.
export function useEventDashboard(eventId: string | undefined, event: EventData | null, perms: EventPermissions) {
  const stage = event ? getDashboardStage(event) : null

  const showLiveFeed = (stage === 'waiting_first_checkin' || stage === 'live') && perms.viewLiveDashboard
  const showWaitlist = (stage === 'open' || stage === 'full') && (perms.viewReports || perms.viewLiveDashboard)

  // No se limpia explícitamente a [] cuando showLiveFeed/showWaitlist pasan
  // a false: el valor stale queda sin usar porque Reports.tsx solo lee
  // recentCheckins/waitlist en las etapas donde estas mismas condiciones son
  // verdaderas — evita un setState síncrono en el efecto sin ganar nada.
  const [recentCheckins, setRecentCheckins] = useState<CheckinLog[]>([])
  useEffect(() => {
    if (!eventId || !showLiveFeed) return
    return subscribeToRecentCheckins(eventId, RECENT_CHECKINS_LIMIT, setRecentCheckins)
  }, [eventId, showLiveFeed])

  const [waitlist, setWaitlist] = useState<WaitlistEntryData[]>([])
  useEffect(() => {
    if (!eventId || !showWaitlist) return
    return subscribeToWaitlist(eventId, setWaitlist)
  }, [eventId, showWaitlist])

  const vipTagId = event?.vipTagId
  const [vipCount, setVipCount] = useState<number | null>(null)
  useEffect(() => {
    if (!eventId || !showLiveFeed || !vipTagId) return
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
  }, [eventId, showLiveFeed, vipTagId])

  const arrivals = useMemo(() => recentCheckins.filter((c) => c.type === 'check_in'), [recentCheckins])
  const rejected = useMemo(() => recentCheckins.filter((c) => c.type === 'entry_blocked'), [recentCheckins])

  // Personas invitadas que nunca hicieron check-in — checkedInCount es
  // asistencia ACUMULADA (no baja si alguien sale), así que resta bien contra
  // peopleCount sin verse afectado por salidas temporales/definitivas.
  const pendingCount = event ? Math.max(event.peopleCount - event.checkedInCount, 0) : 0
  const occupancyPercent = event && event.capacity > 0
    ? Math.min(Math.round((event.occupancyCount / event.capacity) * 100), 100)
    : null

  // "Hace X" desde el último check-in y ritmo de ingreso (últimos 10 min) —
  // ambos gratis: se calculan sobre `recentCheckins`, que ya está en memoria.
  // Date.now() se llama en un efecto (no en render/useMemo, que deben ser
  // puros) — se recalcula cada vez que llega un check-in nuevo.
  const lastCheckinAt = arrivals[0]?.timestamp ?? null
  const [recentPaceCount, setRecentPaceCount] = useState(0)
  /* eslint-disable react-hooks/set-state-in-effect -- lee Date.now() (impuro por diseño, no puede vivir en render/useMemo) para clasificar `arrivals` contra una ventana móvil de 10 min */
  useEffect(() => {
    const cutoff = Date.now() - RECENT_PACE_WINDOW_MS
    setRecentPaceCount(arrivals.filter((c) => c.timestamp >= cutoff).length)
  }, [arrivals])
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    stage,
    recentCheckins,
    arrivals,
    rejected,
    // null en cuanto no hay vipTagId configurado (aunque quede un valor
    // stale de una etiqueta anterior en el state) — evita el setState
    // síncrono al inicio del efecto de arriba.
    vipCount: vipTagId && showLiveFeed ? vipCount : null,
    pendingCount,
    occupancyPercent,
    waitlist,
    lastCheckinAt,
    recentPaceCount,
  }
}
