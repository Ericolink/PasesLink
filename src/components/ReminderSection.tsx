import { useState } from 'react'
import type { GuestData } from '../types'
import type { EventData } from '../types'
import { IconBell, IconCheckCircle, IconWhatsApp } from './Icons'
import { buildPassUrl } from '../utils/qrUrl'

interface Props {
  event: EventData
  guests: GuestData[]
}

function cleanPhone(raw: string): string {
  // Keep only digits and leading +
  return raw.replace(/[^\d+]/g, '')
}

export function ReminderSection({ event, guests }: Props) {
  const [bulkCopied, setBulkCopied] = useState(false)

  const pending = guests.filter((g) => g.rsvpStatus === 'pending')
  const pendingWithPhone = pending.filter((g) => g.phone?.trim())

  if (pending.length === 0) return null

  function reminderMessage(guest: GuestData): string {
    const passUrl = buildPassUrl(event.id, guest.qrToken)
    return `Hola ${guest.name} 👋 Te recordamos que el evento *${event.name}* se acerca. Todavía no confirmaste tu asistencia. Acedé a tu pase aquí: ${passUrl}`
  }

  function copyBulkMessage() {
    const lines = pending
      .map((g) => `• ${g.name}: ${buildPassUrl(event.id, g.qrToken)}`)
      .join('\n')
    const msg = `Recordatorio — *${event.name}*\n\nEstos invitados aún no confirmaron su asistencia:\n${lines}\n\nConfirmá tu asistencia en tu pase personal.`
    navigator.clipboard.writeText(msg).then(() => {
      setBulkCopied(true)
      setTimeout(() => setBulkCopied(false), 2500)
    })
  }

  return (
    <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 mb-5">
      <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <div className="flex items-center gap-2">
          <IconBell className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Recordatorios
          </span>
          <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-2 py-0.5 font-medium">
            {pending.length} pendiente{pending.length !== 1 ? 's' : ''}
          </span>
        </div>
        <span className="text-xs text-gray-400">
          <span className="group-open:hidden">▾ Ver</span>
          <span className="hidden group-open:inline">▴ Ocultar</span>
        </span>
      </summary>

      <div className="border-t border-gray-100 dark:border-gray-700 p-5 space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Estos invitados no han confirmado su asistencia. Envíales un recordatorio por WhatsApp directamente desde aquí.
        </p>

        {/* Botón de mensaje bulk */}
        <button
          onClick={copyBulkMessage}
          className="w-full flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {bulkCopied
            ? <><IconCheckCircle className="w-4 h-4 text-green-500" /> ¡Copiado!</>
            : <><IconBell className="w-4 h-4" /> Copiar mensaje con todos los pases</>
          }
        </button>

        {/* Lista de invitados pendientes */}
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {pending.map((guest) => {
            const phone = cleanPhone(guest.phone || '')
            const msg = reminderMessage(guest)
            const waUrl = phone
              ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
              : `https://wa.me/?text=${encodeURIComponent(msg)}`

            return (
              <div
                key={guest.id}
                className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{guest.name}</p>
                  {guest.phone && (
                    <p className="text-xs text-gray-400 truncate">{guest.phone}</p>
                  )}
                </div>
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 shrink-0 bg-[#25D366] text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <IconWhatsApp className="w-3.5 h-3.5" />
                  {phone ? 'Enviar' : 'Copiar'}
                </a>
              </div>
            )
          })}
        </div>

        {pendingWithPhone.length < pending.length && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {pending.length - pendingWithPhone.length} invitado(s) sin número de teléfono registrado — usa el mensaje bulk para copiar todos los links.
          </p>
        )}
      </div>
    </details>
  )
}
