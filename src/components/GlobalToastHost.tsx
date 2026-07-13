import { useEffect, useRef, useState } from 'react'
import { onEmailNotification } from '../utils/emailNotifications'
import { IconAlertTriangle } from './Icons'
import { Toast } from './Toast'

const DISPLAY_MS = 6000

/** Montado una sola vez en App.tsx — visible sin importar en qué ruta esté el usuario cuando un envío de email falla en segundo plano. */
export function GlobalToastHost() {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return onEmailNotification((msg) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setMessage(msg)
      timerRef.current = setTimeout(() => setMessage(null), DISPLAY_MS)
    })
  }, [])

  function dismiss() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setMessage(null)
  }

  if (!message) return null

  return <Toast tone="warning" icon={<IconAlertTriangle className="w-4 h-4 shrink-0" />} message={message} onDismiss={dismiss} />
}
