import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { getEvent } from '../firebase/events'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { InvitationCard } from '../components/InvitationCard'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { EventCountdown } from '../components/EventCountdown'
import { formatTime12h } from '../utils/time'
import { IconBan } from '../components/Icons'
import { CrownLoader } from '../components/CrownLoader'
import type { EventData } from '../types'

type State = 'loading' | 'ready' | 'not_found' | 'error'

export function EventArrive() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<EventData | null>(null)
  const [state, setState] = useState<State>('loading')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Antes: listener en vivo sobre events/{eventId} (mismo antipatrón que
  // GuestPass.tsx — ver el comentario ahí para el detalle completo, hallazgo
  // F1 de la auditoría de escalabilidad). Esta pantalla es un QR fijo de
  // "ingreso libre" pensado para quedar abierto en un cartel/tablet en el
  // venue durante todo el evento — exactamente el momento en que más
  // check-ins (y por lo tanto más escrituras al documento del evento) están
  // ocurriendo. No muestra ningún contador en vivo (verificado: no
  // referencia checkedInCount/occupancyCount/peopleCount), solo campos que
  // cambian con ediciones del organizador (horario, portada, mensaje de
  // bienvenida). Se reemplaza por una lectura puntual al montar + refresco
  // cuando la pestaña vuelve a estar visible.
  useEffect(() => {
    if (!id) return
    const eventId = id
    let cancelled = false
    getEvent(eventId).then((ev) => {
      if (cancelled) return
      if (!ev) { setState('not_found'); return }
      if (ev.entryMode === 'list') { setState('error'); return }
      setEvent(ev)
      setState('ready')
    })
    function onVisible() {
      if (document.visibilityState !== 'visible') return
      getEvent(eventId).then((ev) => {
        if (!cancelled && ev) setEvent(ev)
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [id])

  useEffect(() => {
    if (state === 'ready' && canvasRef.current && id) {
      const arriveUrl = window.location.origin + `/events/${id}/arrive`
      QRCode.toCanvas(canvasRef.current, arriveUrl, { width: 220, margin: 2 })
    }
  }, [state, id])

  if (state === 'loading') {
    return <CrownLoader />
  }

  if (state === 'not_found' || state === 'error') {
    return (
      <div className="min-h-dvh flex items-center justify-center p-4">
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
      className="min-h-dvh flex items-center justify-center text-center p-4"
    >
      <div className="w-full max-w-sm">
        <InvitationCard coverImage={event?.coverImage} coverAlt={event?.name} priority>
          <h1 className="text-xl font-bold mb-1">{event?.name}</h1>
          <ThemeOrnament templateId={event?.templateId} className="w-16 h-6 mx-auto mt-1 mb-2 text-[var(--invite-accent)]" />
          <p className={`text-sm text-[var(--invite-text-muted)] ${event?.startTime ? '' : 'mb-4'}`}>
            {event?.date} · {event?.location}
          </p>
          {event?.startTime && (
            <p className="text-2xl font-bold mt-1 text-[var(--invite-accent)]">
              {formatTime12h(event.startTime)}{event.endTime && ` – ${formatTime12h(event.endTime)}`}
            </p>
          )}
          {event && (
            <EventCountdown
              date={event.date}
              startTime={event.startTime}
              endTime={event.endTime}
              className="mt-1 mb-4 mx-auto"
            />
          )}

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
