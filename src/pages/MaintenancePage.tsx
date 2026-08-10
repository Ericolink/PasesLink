import { useEffect, useRef, useState } from 'react'
import type { Timestamp } from 'firebase/firestore'
import { IconTool } from '../components/accessibility/AccessibleIcon'
import { AccessibleButton } from '../components/accessibility/AccessibleButton'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

interface MaintenancePageProps {
  message?: string
  updatedAt?: Timestamp | null
}

const DEFAULT_MESSAGE = 'PaseLink está temporalmente fuera de servicio mientras realizamos algunas mejoras.'

function formatUpdatedAt(updatedAt: Timestamp): string {
  return updatedAt.toDate().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

// Reemplaza la navegación entera (ver MaintenanceGate.tsx) — a propósito NO
// usa PublicLayout/AppShell/BrowseLayout: ninguno de esos tres chrome
// encajaría acá (todos asumen una app funcionando). `id="main-content"` +
// `tabIndex={-1}` replican el mismo contrato que esos layouts sí tienen, así
// RouteAnnouncer (App.tsx) sigue moviendo el foco acá al llegar, sin lógica
// nueva de foco por fuera de la que ya existe para cualquier otra pantalla.
export function MaintenancePage({ message, updatedAt }: MaintenancePageProps) {
  useDocumentTitle('Mantenimiento')
  const [retrying, setRetrying] = useState(false)
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (retryTimeout.current) clearTimeout(retryTimeout.current)
    }
  }, [])

  const handleRetry = () => {
    if (retrying) return
    setRetrying(true)
    // Pequeño respiro visual antes de recargar — evita que un click
    // repetido dispare varias recargas encadenadas (sin polling, un solo
    // intento manual por click, tal como pide el pedido original).
    retryTimeout.current = setTimeout(() => window.location.reload(), 300)
  }

  return (
    <main id="main-content" tabIndex={-1} className="min-h-dvh flex flex-col items-center justify-center text-center px-4">
      <IconTool className="w-12 h-12 mb-4 text-primary" />
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
        Estamos realizando mantenimiento
      </h1>
      <p className="text-gray-600 dark:text-gray-300 max-w-sm text-sm">
        {message?.trim() || DEFAULT_MESSAGE}
      </p>
      <p className="text-gray-600 dark:text-gray-300 max-w-sm text-sm mt-1 mb-6">
        Volveremos a estar disponibles pronto. Gracias por tu paciencia.
      </p>
      <AccessibleButton onClick={handleRetry} loading={retrying}>
        {retrying ? 'Reintentando…' : 'Intentar nuevamente'}
      </AccessibleButton>
      {updatedAt && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
          Última actualización: {formatUpdatedAt(updatedAt)}
        </p>
      )}
    </main>
  )
}
