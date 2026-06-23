import { useEffect, useState } from 'react'
import { onEmailNotification } from '../utils/emailNotifications'
import { IconAlertTriangle } from './Icons'

const DISPLAY_MS = 6000

/** Montado una sola vez en App.tsx — visible sin importar en qué ruta esté el usuario cuando un envío de email falla en segundo plano. */
export function GlobalToastHost() {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    return onEmailNotification((msg) => {
      setMessage(msg)
      setTimeout(() => setMessage(null), DISPLAY_MS)
    })
  }, [])

  if (!message) return null

  return (
    <div className="fixed top-16 right-4 z-50 bg-amber-600 text-white text-sm rounded-lg shadow-lg px-4 py-2.5 flex items-center gap-2 max-w-xs animate-fade-in">
      <IconAlertTriangle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  )
}
