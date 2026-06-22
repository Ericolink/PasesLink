import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { getEvent } from '../firebase/events'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { InvitationCard } from '../components/InvitationCard'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { IconBan } from '../components/Icons'
import type { EventData } from '../types'

type State = 'loading' | 'ready' | 'not_found' | 'error'

export function EventArrive() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<EventData | null>(null)
  const [state, setState] = useState<State>('loading')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!id) return
    getEvent(id).then((ev) => {
      if (!ev) { setState('not_found'); return }
      if (ev.entryMode === 'list') { setState('error'); return }
      setEvent(ev)
      setState('ready')
    })
  }, [id])

  useEffect(() => {
    if (state === 'ready' && canvasRef.current && id) {
      const arriveUrl = window.location.origin + `/events/${id}/arrive`
      QRCode.toCanvas(canvasRef.current, arriveUrl, { width: 220, margin: 2 })
    }
  }, [state, id])

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (state === 'not_found' || state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <IconBan className="w-12 h-12 text-gray-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            {state === 'not_found' ? 'Este evento no existe.' : 'Este evento no acepta ingresos libres.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <InvitationThemeRoot
      templateId={event?.templateId}
      accentOverride={event?.accentColor}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div className="w-full max-w-sm">
        <InvitationCard coverImage={event?.coverImage} coverAlt={event?.name}>
          <h1 className="text-xl font-bold mb-1">{event?.name}</h1>
          <ThemeOrnament templateId={event?.templateId} className="w-16 h-6 mx-auto mt-1 mb-2 text-[var(--invite-accent)]" />
          <p className="text-sm mb-4 text-[var(--invite-text-muted)]">{event?.date} · {event?.location}</p>

          <div className="flex justify-center mb-4">
            <canvas ref={canvasRef} className="rounded-lg" />
          </div>

          <p className="text-sm font-medium mb-1">
            Muestra este QR en la entrada
          </p>
          <p className="text-xs text-[var(--invite-text-muted)]">
            El guardia lo escaneará para registrar tu ingreso
          </p>

          {event?.welcomeMessage && (
            <p className="text-sm italic mt-4 text-[var(--invite-accent)]">{event.welcomeMessage}</p>
          )}
        </InvitationCard>
      </div>
    </InvitationThemeRoot>
  )
}
