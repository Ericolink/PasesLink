import { useEffect, useRef, useState } from 'react'
import { downloadICS, googleCalendarUrl, outlookCalendarUrl } from '../utils/calendarLinks'
import type { CalendarEvent } from '../utils/calendarLinks'
import { IconCalendar } from './Icons'

interface Props {
  event: CalendarEvent
  className?: string
}

export function AddToCalendarButton({ event, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Cierra el menú al hacer click fuera
  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const options = [
    {
      label: 'Google Calendar',
      icon: '📅',
      action: () => {
        window.open(googleCalendarUrl(event), '_blank', 'noopener')
        setOpen(false)
      },
    },
    {
      label: 'Outlook',
      icon: '📆',
      action: () => {
        window.open(outlookCalendarUrl(event), '_blank', 'noopener')
        setOpen(false)
      },
    },
    {
      label: 'Apple Calendar / otro',
      icon: '📁',
      action: () => {
        downloadICS(event)
        setOpen(false)
      },
    },
  ]

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center gap-2 border rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
        style={{
          borderColor: 'var(--invite-border)',
          color: 'var(--invite-text)',
          background: 'var(--invite-surface)',
        }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span style={{ color: 'var(--invite-accent)' }}><IconCalendar className="w-4 h-4" /></span>
        + Calendario
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-2 left-0 z-20 rounded-xl shadow-lg overflow-hidden min-w-[200px]"
          style={{
            background: 'var(--invite-surface)',
            border: '1px solid var(--invite-border)',
          }}
          role="menu"
        >
          {options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={opt.action}
              role="menuitem"
              className="w-full text-left flex items-center gap-2.5 px-4 py-3 text-sm transition-colors hover:opacity-80"
              style={{ color: 'var(--invite-text)' }}
            >
              <span>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
