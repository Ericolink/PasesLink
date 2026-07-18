import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getCheckins } from '../firebase/reports'
import { getAllGuests, partySize } from '../firebase/guests'
import { useEventOnly } from '../hooks/useEventOnly'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { attendancePercent } from '../utils/attendance'
import type { CheckinLog, GuestData } from '../types'
import { PAYMENT_STATUS_LABELS, RSVP_LABELS } from '../types'
import { IconCheck, IconCornerUpLeft } from '../components/Icons'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { LoadingInline } from '../components/LoadingInline'
import { SkeletonBlock } from '../components/Skeleton'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { MetricTile } from '../components/MetricTile'
import { EventAnalytics } from '../components/EventAnalytics'

const CHECKIN_TIMELINE_PAGE_SIZE = 50
const GUEST_DETAIL_PAGE_SIZE = 50

export function Reports() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  // useEventOnly (no useEvent): esta pantalla ya no necesita una suscripción
  // en vivo a `guests` — ver getAllGuests más abajo (auditoría F3).
  const { event, loading } = useEventOnly(eventId)
  useDocumentTitle(event ? `Reportes · ${event.name}` : 'Reportes')
  useDashboardTheme(event?.templateId, event?.accentColor)
  const [checkins, setCheckins] = useState<CheckinLog[]>([])
  const [checkinsLoading, setCheckinsLoading] = useState(true)
  const [checkinsError, setCheckinsError] = useState(false)
  // "Línea de tiempo" renderiza solo los últimos N check-ins (getCheckins ya
  // trae el historial completo en memoria — ver comentario ahí sobre por qué
  // no se puede truncar la LECTURA sin romper "Llegadas por hora" — esto solo
  // limita cuántos nodos DOM se montan de una vez, mismo patrón que
  // GUEST_LIST_PAGE_SIZE en GuestList.tsx).
  const [visibleCheckinCount, setVisibleCheckinCount] = useState(CHECKIN_TIMELINE_PAGE_SIZE)
  const [guests, setGuests] = useState<GuestData[]>([])
  const [guestsLoading, setGuestsLoading] = useState(true)
  const [guestsError, setGuestsError] = useState(false)
  const [visibleGuestCount, setVisibleGuestCount] = useState(GUEST_DETAIL_PAGE_SIZE)
  // Incrementarlo vuelve a disparar los efectos de abajo sin depender de
  // eventId — es el botón "Actualizar", refresca checkins Y guests juntos
  // (ambos son lecturas puntuales, no en vivo).
  const [refreshToken, setRefreshToken] = useState(0)

  // rsvpYes/No/Pending: contadores desnormalizados (auditoría F22, ver
  // EventData.rsvpYesCount/rsvpNoCount/rsvpPendingCount) — igual que
  // totalPeople/totalCollected abajo, ya no dependen de recorrer `guests`.
  const rsvpYes = event?.rsvpYesCount ?? 0
  const rsvpNo = event?.rsvpNoCount ?? 0
  const rsvpPending = event?.rsvpPendingCount ?? 0
  const totalPeople = event?.peopleCount ?? 0
  const totalCollected = (event?.ticketPrice ?? 0) * (event?.paidCount ?? 0)
  const perms = useEventPermissions(event, user)

  // "Llegadas por hora": antes recorría TODO `checkins` (el historial
  // completo cargado por getCheckins) en cada carga/actualización — ver
  // auditoría de escalabilidad, hallazgo F4. Ahora lee el contador ya
  // agregado server-side (event.checkinsByHour, mantenido con increment()
  // en checkInGuest/confirmPaymentAndCheckIn) — O(1) sin importar el
  // tamaño del evento, no necesita useMemo (a lo sumo 24 claves).
  const hourEntries = Object.entries(event?.checkinsByHour ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const maxHourCount = Math.max(1, ...hourEntries.map(([, count]) => count))

  // Carga puntual (no en vivo, ver getCheckins) — se repite al cambiar de
  // evento y cada vez que se pide "Actualizar". Las tarjetas de "Escaneados"/
  // "Dentro ahora" de arriba siguen en tiempo real (vienen de
  // event.checkedInCount/occupancyCount vía useEventOnly, no de esta lista).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    setCheckinsLoading(true)
    setCheckinsError(false)
    getCheckins(eventId)
      .then((data) => {
        if (cancelled) return
        setCheckins(data)
        setVisibleCheckinCount(CHECKIN_TIMELINE_PAGE_SIZE)
      })
      .catch((err) => {
        console.error('Error loading checkins:', err)
        if (!cancelled) setCheckinsError(true)
      })
      .finally(() => {
        if (!cancelled) setCheckinsLoading(false)
      })
    return () => { cancelled = true }
  }, [eventId, refreshToken])

  // Carga puntual de TODOS los invitados (auditoría F3: antes era un
  // listener SIN LÍMITE reabierto en cada snapshot mientras esta pantalla
  // estaba abierta — ver getAllGuests/GUEST_WINDOW_DEFAULT en guests.ts).
  // Alimenta "Analytics de llegadas" (EventAnalytics) y "Detalle por
  // invitado" — ninguna de las dos necesita estar en vivo, se refrescan con
  // el mismo botón "Actualizar" que ya usa checkins.
  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    setGuestsLoading(true)
    setGuestsError(false)
    getAllGuests(eventId)
      .then((data) => {
        if (cancelled) return
        setGuests(data)
        setVisibleGuestCount(GUEST_DETAIL_PAGE_SIZE)
      })
      .catch((err) => {
        console.error('Error loading guests:', err)
        if (!cancelled) setGuestsError(true)
      })
      .finally(() => {
        if (!cancelled) setGuestsLoading(false)
      })
    return () => { cancelled = true }
  }, [eventId, refreshToken])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <SkeletonBlock className="h-6 w-1/3 mb-2" />
        <SkeletonBlock className="h-4 w-1/4 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SkeletonBlock className="h-20 rounded-xl" />
          <SkeletonBlock className="h-20 rounded-xl" />
          <SkeletonBlock className="h-20 rounded-xl" />
          <SkeletonBlock className="h-20 rounded-xl" />
        </div>
        <SkeletonBlock className="h-40 rounded-lg" />
      </div>
    )
  }
  if (!event) {
    return <ErrorFallbackCTA message="Evento no encontrado." />
  }
  if (user && !perms.viewReports) {
    return <ErrorFallbackCTA message="No tienes acceso a este evento." />
  }

  function exportCsv() {
    // Columna de pago solo si el evento cobra entrada — en un evento
    // gratuito paymentStatus siempre es 'unpaid' (no significa nada), no
    // vale la pena mostrarlo.
    const headers = ['Invitado', 'Apellido', 'Estado', 'Hora de ingreso']
    if (event!.requiresPayment) headers.push('Pago')
    const rows = [headers]
    for (const guest of guests) {
      const row = [
        guest.name,
        guest.lastName || '',
        guest.status === 'checked_in' ? 'Confirmado' : 'Pendiente',
        guest.checkedInAt ? new Date(guest.checkedInAt).toLocaleString() : '',
      ]
      if (event!.requiresPayment) row.push(PAYMENT_STATUS_LABELS[guest.paymentStatus])
      rows.push(row)
    }
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    // BOM UTF-8: sin esto, Excel (el consumidor más común de este CSV) asume
    // Latin-1/ANSI al abrirlo y rompe tildes/ñ (ej. "María" → "MarÃ­a").
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event!.name.replace(/\s+/g, '_')}_reporte.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const content = (
    <>
      <ScreenHeader title="Reportes" subtitle={event.name} backTo={`/events/${event.id}`} templateId={event.templateId} />

      {/* ── ESTADÍSTICAS PRINCIPALES ── (extraído de EventDetail.tsx, misma
          fórmula de cada valor, solo que ahora vive acá) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <MetricTile
          label="Registrados"
          value={event.guestCount}
          sub={`${totalPeople} personas en total`}
        />
        <MetricTile
          label="Escaneados"
          value={event.checkedInCount}
          // % sobre personas totales (totalPeople, ya suma partySize de cada
          // invitado/familia), no sobre guestCount (cantidad de invitaciones/
          // documentos) — checkedInCount es un conteo de PERSONAS, dividirlo
          // por la cantidad de invitaciones daba porcentajes >100% en cuanto
          // había acompañantes o familias con varios integrantes.
          sub={totalPeople > 0
            ? `${Math.round(attendancePercent(event.checkedInCount, totalPeople))}% del total`
            : undefined}
          accent="success"
        />
        {event.requiresPayment && (
          <MetricTile
            label="Pagados"
            value={event.paidCount}
            sub={totalPeople > 0
              ? `${Math.round(attendancePercent(event.paidCount, totalPeople))}% del total`
              : undefined}
            accent="success"
          />
        )}
        <MetricTile label="Dentro ahora" value={event.occupancyCount} accent="primary" />
        <MetricTile label="Pendientes" value={Math.max(0, totalPeople - event.checkedInCount)} />
      </div>

      {/* Cupo recomendado (informativo, nunca bloquea nuevos registros) */}
      {event.capacity > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-4 mb-6">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span>Cupo recomendado del evento</span>
            <span className="font-semibold">{totalPeople} / {event.capacity}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${attendancePercent(totalPeople, event.capacity)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── CONFIRMACIONES Y PAGOS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MetricTile label="Asistirán" value={rsvpYes} accent="primary" />
        <MetricTile label="No asistirán" value={rsvpNo} />
        <MetricTile label="Sin responder" value={rsvpPending} />
        {event.requiresPayment && (
          <MetricTile
            label={`Recaudado (${event.currency})`}
            value={totalCollected}
            accent="success"
          />
        )}
      </div>

      {/* ── ACTIVIDAD DE LLEGADA ── (extraído de EventDetail.tsx, mismo
          componente reutilizado, sin cambios en su lógica interna) */}
      <EventAnalytics guests={guests} loading={guestsLoading} />

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
        <h2 className="font-medium text-gray-900 dark:text-white mb-3">Llegadas por hora</h2>
        {checkinsError ? (
          <p className="text-sm text-red-500">No se pudo cargar el historial de check-ins.</p>
        ) : checkinsLoading ? (
          <LoadingInline label="Cargando asistentes…" />
        ) : hourEntries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay check-ins registrados.</p>
        ) : (
          <div className="space-y-2">
            {hourEntries.map(([hour, count]) => (
              <div key={hour} className="flex items-center gap-2 text-sm">
                <span className="w-12 text-gray-500 dark:text-gray-400">{hour}</span>
                <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(count / maxHourCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-gray-700 dark:text-gray-300">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900 dark:text-white">Detalle por invitado</h2>
          {perms.exportLists && (
            <button
              onClick={exportCsv}
              disabled={guestsLoading}
              className="text-sm text-primary font-medium disabled:opacity-40"
            >
              Exportar CSV
            </button>
          )}
        </div>
        {guestsError ? (
          <p className="text-sm text-red-500">No se pudo cargar la lista de invitados. Intenta actualizar de nuevo.</p>
        ) : guestsLoading ? (
          <LoadingInline label="Cargando asistentes…" />
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {/* flex-wrap + el span de estado en w-full: cuando el nombre es
                  largo y no entran los 3 en una fila, el estado pasa solo a su
                  propia línea en vez de superponerse o forzar scroll horizontal
                  — en pantallas con más ancho (sm+), si entran los tres en una
                  fila, se acomodan igual que antes (w-auto). */}
              {/* Paginado en bloques de GUEST_DETAIL_PAGE_SIZE (auditoría F7,
                  mismo patrón que GuestList.tsx) — `guests` ya está completo
                  en memoria (getAllGuests trajo todo), esto solo limita
                  cuántos nodos DOM se montan de una vez. */}
              {guests.slice(0, visibleGuestCount).map((guest) => (
                <div key={guest.id} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5 py-2 text-sm">
                  <span className="text-gray-900 dark:text-white min-w-0 flex-1 break-words">
                    {guest.isGroup ? (
                      <>
                        {guest.name}
                        <span className="text-gray-400 dark:text-gray-500"> · {partySize(guest)} integrantes</span>
                      </>
                    ) : (
                      <>
                        {guest.name} {guest.lastName}
                        {guest.companions.length > 0 && <span className="text-gray-400 dark:text-gray-500"> +{guest.companions.length}</span>}
                      </>
                    )}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">{RSVP_LABELS[guest.rsvpStatus]}</span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs w-full sm:w-auto sm:text-right shrink-0">
                    {guest.status === 'checked_in' && guest.checkedInAt ? (
                      <>
                        Entró {new Date(guest.checkedInAt).toLocaleTimeString()}
                        {guest.checkedOutAt && (
                          <> · {guest.exitType === 'final' ? 'Salió (definitivo)' : 'Salió (temporal)'} {new Date(guest.checkedOutAt).toLocaleTimeString()}</>
                        )}
                      </>
                    ) : (
                      'Pendiente'
                    )}
                  </span>
                </div>
              ))}
            </div>
            {guests.length > visibleGuestCount && (
              <button
                onClick={() => setVisibleGuestCount((c) => c + GUEST_DETAIL_PAGE_SIZE)}
                className="w-full text-sm text-primary font-medium py-2.5 hover:underline"
              >
                Cargar más invitados ({guests.length - visibleGuestCount} restantes)
              </button>
            )}
          </>
        )}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900 dark:text-white">Línea de tiempo</h2>
          {/* Esta lista, "Detalle por invitado" y "Analytics de llegadas" se
              cargan una vez al abrir (no en vivo, ver getCheckins/
              getAllGuests) — este botón las refresca sin salir de la
              pantalla. Los conteos de arriba (Escaneados/Dentro ahora/
              Llegadas por hora) siguen en tiempo real, no dependen de este
              botón. */}
          <button
            onClick={() => setRefreshToken((n) => n + 1)}
            disabled={checkinsLoading || guestsLoading}
            className="text-sm text-primary font-medium disabled:opacity-50"
          >
            {checkinsLoading || guestsLoading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
        {checkinsError ? (
          <p className="text-sm text-red-500">No se pudo cargar el historial de check-ins. Intenta actualizar de nuevo.</p>
        ) : checkinsLoading ? (
          <LoadingInline label="Cargando asistentes…" />
        ) : checkins.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay check-ins registrados.</p>
        ) : (
          <>
            {/* checkins viene ordenado ascendente (más viejo primero, ver
                getCheckins) — se muestran los últimos N (más recientes) y
                este botón revela más hacia atrás en el tiempo. */}
            {checkins.length > visibleCheckinCount && (
              <button
                onClick={() => setVisibleCheckinCount((c) => c + CHECKIN_TIMELINE_PAGE_SIZE)}
                className="w-full text-sm text-primary font-medium py-2 hover:underline"
              >
                Cargar check-ins anteriores ({checkins.length - visibleCheckinCount} restantes)
              </button>
            )}
            <ul className="text-sm space-y-1.5">
            {/* min-w-0 + break-words en el texto: nombres/emails largos
                pasan a una segunda línea en vez de superponerse con la
                hora — la hora vive en su propio span shrink-0, así que
                nunca se comprime ni queda tapada. */}
            {checkins.slice(Math.max(0, checkins.length - visibleCheckinCount)).map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 text-gray-700 dark:text-gray-300">
                <span className="inline-flex items-start gap-1.5 min-w-0 flex-1">
                  {c.type === 'check_out' ? (
                    <IconCornerUpLeft className="w-3.5 h-3.5 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                  ) : (
                    <IconCheck className="w-3.5 h-3.5 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
                  )}
                  <span className="break-words">
                    {c.guestName}
                    {c.type === 'check_out' && (
                      <span className="text-gray-400 dark:text-gray-500"> · {c.exitKind === 'final' ? 'salida definitiva' : 'salida temporal'}</span>
                    )}
                    {c.type === 'check_in' && c.reentry && <span className="text-gray-400 dark:text-gray-500"> · reingreso</span>}
                    {c.scannedByEmail && <span className="text-gray-400 dark:text-gray-500"> · {c.scannedByEmail}</span>}
                  </span>
                </span>
                <span className="text-gray-400 dark:text-gray-500 shrink-0">{new Date(c.timestamp).toLocaleTimeString()}</span>
              </li>
            ))}
            </ul>
          </>
        )}
      </div>
    </>
  )

  return <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">{content}</div>
}
