import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { getUserProfile } from '../firebase/userProfile'
import { sendCheckinSummary, type CheckinSummaryEntry } from '../firebase/guests'
import type { GuestData } from '../types'

// Extraído de EventDetail.tsx (Fase 4B): acumulador de check-ins "de esta
// sesión" para el resumen por email del organizador. Se deriva de `guests`
// (ya en tiempo real vía useEvent) en vez de abrir un segundo listener a
// `checkins` — useCheckinToast cubre el toast in-app y no se toca.
// `seenCheckedInIds` guarda los ids ya vistos como checked_in; null
// significa "todavía no se fijó la base" (primer render de este eventId),
// así los check-ins de ANTES de abrir esta página no cuentan como "de esta
// sesión".
export function useCheckinSessionAccumulator(
  eventId: string | undefined,
  guests: GuestData[],
  user: User | null,
) {
  const [checkinsThisSession, setCheckinsThisSession] = useState<CheckinSummaryEntry[]>([])
  const seenCheckedInIds = useRef<Set<string> | null>(null)
  const sessionEventIdRef = useRef<string | undefined>(undefined)
  const [organizerNotifyEnabled, setOrganizerNotifyEnabled] = useState(false)
  const [summarySending, setSummarySending] = useState(false)
  const [summaryToast, setSummaryToast] = useState<string | null>(null)

  useEffect(() => {
    // Reinicia el acumulador si se navega a otro evento sin desmontar el
    // componente — la comparación contra el ref (no solo el array de deps)
    // es lo que evita que este reset se mezcle con el cálculo de abajo en
    // cada actualización de `guests` del MISMO evento.
    if (sessionEventIdRef.current !== eventId) {
      sessionEventIdRef.current = eventId
      seenCheckedInIds.current = null
      setCheckinsThisSession([])
    }
    const checkedInNow = guests.filter((g) => g.status === 'checked_in')
    if (seenCheckedInIds.current === null) {
      seenCheckedInIds.current = new Set(checkedInNow.map((g) => g.id))
      return
    }
    const seen = seenCheckedInIds.current
    const newlyCheckedIn = checkedInNow.filter((g) => !seen.has(g.id))
    if (newlyCheckedIn.length === 0) return
    newlyCheckedIn.forEach((g) => seen.add(g.id))
    setCheckinsThisSession((prev) => [
      ...prev,
      ...newlyCheckedIn.map((g) => ({ name: g.name, checkInTime: g.checkedInAt ?? Date.now(), status: 'checked_in' as const })),
    ])
  }, [eventId, guests])

  useEffect(() => {
    if (!user) return
    getUserProfile(user.uid).then((profile) => setOrganizerNotifyEnabled(profile?.notifyOnCheckin === true))
  }, [user])

  async function handleSendCheckinSummary() {
    if (!eventId || !user || checkinsThisSession.length === 0) return
    setSummarySending(true)
    try {
      await sendCheckinSummary(eventId, user.uid, checkinsThisSession)
      setCheckinsThisSession([])
      setSummaryToast('Resumen de check-ins enviado.')
      setTimeout(() => setSummaryToast(null), 4000)
    } finally {
      setSummarySending(false)
    }
  }

  return { checkinsThisSession, organizerNotifyEnabled, summarySending, summaryToast, handleSendCheckinSummary }
}
