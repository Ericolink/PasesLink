import { useEffect, useMemo, useState } from 'react'
import { getAllGuests, partySize } from '../../firebase/guests'
import { useLoadingAnnouncement } from '../../hooks/useLoadingAnnouncement'
import { formatDateTimeMedium } from '../../utils/time'
import { LoadingInline } from '../LoadingInline'
import { RSVP_LABELS, PAYMENT_STATUS_LABELS } from '../../types'
import type { EventData, GuestData } from '../../types'

const GUEST_DETAIL_PAGE_SIZE = 50

interface Props {
  eventId: string
  event: EventData
  canExport: boolean
}

// Extraído de Reports.tsx: antes se cargaba TODA la subcolección `guests`
// (getAllGuests) en un useEffect incondicional apenas se abría la pantalla,
// sin importar si el organizador iba a mirar esta sección. Ahora vive dentro
// de un <AccordionItem> colapsado por defecto — este componente recién se
// monta (y dispara la lectura) la primera vez que se expande.
export function GuestDetailPanel({ eventId, event, canExport }: Props) {
  const [guests, setGuests] = useState<GuestData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [visibleGuestCount, setVisibleGuestCount] = useState(GUEST_DETAIL_PAGE_SIZE)
  const [refreshToken, setRefreshToken] = useState(0)
  useLoadingAnnouncement(loading, 'Invitados cargados')

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    getAllGuests(eventId)
      .then((data) => {
        if (cancelled) return
        setGuests(data)
        setVisibleGuestCount(GUEST_DETAIL_PAGE_SIZE)
      })
      .catch((err) => {
        console.error('Error loading guests:', err)
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [eventId, refreshToken])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Conteo por platillo/restricción — agregado en cliente sobre `guests` (ya
  // cargado entero para esta sección), sin ninguna lectura extra a Firestore.
  // Cuenta PERSONAS (invitado + cada acompañante), no invitaciones.
  const menu = event.menu
  const menuCounts = useMemo(() => {
    if (!menu || (menu.options.length === 0 && menu.restrictions.length === 0)) return null
    const byOption = new Map<string, number>()
    const byRestriction = new Map<string, number>()
    for (const g of guests) {
      for (const selection of [g.menuSelection, ...g.companions.map((c) => c.menuSelection)]) {
        if (!selection) continue
        if (selection.optionId) byOption.set(selection.optionId, (byOption.get(selection.optionId) || 0) + 1)
        for (const rId of selection.restrictionIds || []) {
          byRestriction.set(rId, (byRestriction.get(rId) || 0) + 1)
        }
      }
    }
    return {
      options: menu.options.map((o) => ({ label: o.name, count: byOption.get(o.id) || 0 })),
      restrictions: menu.restrictions.map((r) => ({ label: r.label, count: byRestriction.get(r.id) || 0 })),
    }
  }, [menu, guests])

  function exportCsv() {
    // Columna de pago solo si el evento cobra entrada — en un evento
    // gratuito paymentStatus siempre es 'unpaid' (no significa nada), no
    // vale la pena mostrarlo.
    const headers = ['Invitado', 'Apellido', 'Estado', 'Hora de ingreso']
    if (event.requiresPayment) headers.push('Pago')
    const rows = [headers]
    for (const guest of guests) {
      const row = [
        guest.name,
        guest.lastName || '',
        guest.status === 'checked_in' ? 'Confirmado' : 'Pendiente',
        guest.checkedInAt ? formatDateTimeMedium(guest.checkedInAt) : '',
      ]
      if (event.requiresPayment) row.push(PAYMENT_STATUS_LABELS[guest.paymentStatus])
      rows.push(row)
    }
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    // BOM UTF-8: sin esto, Excel (el consumidor más común de este CSV) asume
    // Latin-1/ANSI al abrirlo y rompe tildes/ñ (ej. "María" → "MarÃ­a").
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event.name.replace(/\s+/g, '_')}_reporte.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {menuCounts && !loading && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">Menú y restricciones alimenticias</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {menuCounts.options.length > 0 && (
              <dl className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Platillos</p>
                {menuCounts.options.map((o) => (
                  <div key={o.label} className="flex justify-between text-sm">
                    <dt className="text-gray-600 dark:text-gray-300">{o.label}</dt>
                    <dd className="text-gray-900 dark:text-white font-medium">{o.count}</dd>
                  </div>
                ))}
              </dl>
            )}
            {menuCounts.restrictions.length > 0 && (
              <dl className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Restricciones</p>
                {menuCounts.restrictions.map((r) => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <dt className="text-gray-600 dark:text-gray-300">{r.label}</dt>
                    <dd className="text-gray-900 dark:text-white font-medium">{r.count}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900 dark:text-white">Detalle por invitado</h3>
          <div className="flex items-center gap-3">
            {canExport && (
              <button
                onClick={exportCsv}
                disabled={loading}
                className="text-sm text-primary font-medium disabled:opacity-40"
              >
                Exportar CSV
              </button>
            )}
            <button
              onClick={() => setRefreshToken((n) => n + 1)}
              disabled={loading}
              className="text-sm text-primary font-medium disabled:opacity-50"
            >
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-red-500">No se pudo cargar la lista de invitados. Intenta actualizar de nuevo.</p>
        ) : loading ? (
          <LoadingInline label="Cargando asistentes…" />
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
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
                        Entró {new Date(guest.checkedInAt).toLocaleTimeString('es-MX')}
                        {guest.checkedOutAt && (
                          <> · {guest.exitType === 'final' ? 'Salió (definitivo)' : 'Salió (temporal)'} {new Date(guest.checkedOutAt).toLocaleTimeString('es-MX')}</>
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
    </div>
  )
}
