import { useState } from 'react'
import { recordLegalAcceptance } from '../firebase/legalAcceptance'
import { logout } from '../firebase/auth'
import { LegalConsentCheckbox } from './LegalConsentCheckbox'
import { AccessibleButton } from './accessibility/AccessibleButton'

interface Props {
  uid: string
  /** Etiquetas de los documentos pendientes (ej. ["Términos y Condiciones", "Política de Privacidad"]). */
  pendingLabels: string[]
}

// Pantalla de re-aceptación — ver LegalAcceptanceGate en ProtectedRoute.tsx.
// Reusa LegalConsentCheckbox tal cual (el mismo checkbox combinado de
// Términos+Privacidad que ya usan Register/CompleteProfile/GuestSignupPrompt)
// en vez de construir una UI granular por documento: recordLegalAcceptance
// siempre acepta el conjunto completo vigente, así que no hay necesidad real
// de distinguir "solo cambió Privacidad" en la interfaz.
export function LegalReacceptanceScreen({ uid, pendingLabels }: Props) {
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleContinue() {
    setSaving(true)
    setError('')
    try {
      await recordLegalAcceptance(uid, 'reaccept')
      // Sin actualización de estado local: el onSnapshot de useUserProfile
      // (en ProtectedRoute) recibe legalAcceptedVersions actualizado y esta
      // pantalla deja de mostrarse sola en el siguiente render.
    } catch {
      setError('No pudimos registrar tu aceptación. Intenta de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-dvh p-4">
      <div className="max-w-sm w-full bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Actualizamos nuestros documentos legales
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Publicamos una nueva versión de {pendingLabels.join(' y ')} de PaseLink. Acéptala{pendingLabels.length > 1 ? 's' : ''} para seguir usando tu cuenta.
        </p>
        <div className="mb-5">
          <LegalConsentCheckbox id="reaccept-legal-consent" checked={accepted} onChange={setAccepted} />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>}
        <AccessibleButton onClick={handleContinue} disabled={!accepted || saving} className="w-full mb-3">
          {saving ? 'Guardando…' : 'Aceptar y continuar'}
        </AccessibleButton>
        <button
          onClick={() => logout()}
          className="w-full text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-primary"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
