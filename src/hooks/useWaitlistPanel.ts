import { useEffect, useState } from 'react'
import { subscribeToWaitlist, promoteFromWaitlist } from '../firebase/waitlist'
import { buildPassUrl } from '../utils/qrUrl'
import type { WaitlistEntry } from '../types'

// Extraído de EventDetail.tsx (Subfase 3.3): suscripción a la lista de
// espera y promoción de un entry a invitado con pase. NO incluye una
// función "eliminar de lista de espera" — no existe en src/firebase/waitlist.ts
// ni hay un botón para eso en la UI actual (solo "Promover"). No se inventó
// acá; agregarla sería una funcionalidad nueva, fuera del alcance de este
// refactor (que solo mueve lógica existente, no agrega features).
export function useWaitlistPanel(eventId: string | undefined) {
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [promoteResult, setPromoteResult] = useState<{ name: string; phone: string; passUrl: string } | null>(null)
  const [promoteLinkCopied, setPromoteLinkCopied] = useState(false)

  useEffect(() => {
    if (!eventId) return
    return subscribeToWaitlist(eventId, setWaitlist)
  }, [eventId])

  async function handlePromote(entry: WaitlistEntry) {
    if (!eventId) return
    setPromotingId(entry.id)
    try {
      const qrToken = await promoteFromWaitlist(eventId, entry.id, entry.name, entry.lastName, entry.phone)
      if (qrToken) {
        const passUrl = buildPassUrl(eventId, qrToken)
        setPromoteLinkCopied(false)
        setPromoteResult({ name: `${entry.name} ${entry.lastName}`, phone: entry.phone, passUrl })
      }
    } finally {
      setPromotingId(null)
    }
  }

  function handleCopyPromoteLink() {
    if (!promoteResult) return
    navigator.clipboard.writeText(promoteResult.passUrl).then(() => {
      setPromoteLinkCopied(true)
      setTimeout(() => setPromoteLinkCopied(false), 2000)
    }).catch(() => {})
  }

  const waitingEntries = waitlist.filter((e) => e.status === 'waiting')
  const promotedEntries = waitlist.filter((e) => e.status === 'promoted')

  return {
    waitlist,
    waitingEntries,
    promotedEntries,
    promotingId,
    promoteResult,
    promoteLinkCopied,
    handlePromote,
    handleCopyPromoteLink,
    setPromoteResult,
  }
}
