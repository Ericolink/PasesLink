import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useMaintenanceMode } from '../../../hooks/useMaintenanceMode'
import { setMaintenanceMode } from '../../../firebase/platformConfig'

const MESSAGE_MAX_LENGTH = 300

function formatUpdatedAt(updatedAt: ReturnType<typeof useMaintenanceMode>['updatedAt']): string | null {
  if (!updatedAt) return null
  return updatedAt.toDate().toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
}

// Único control de encendido/apagado del modo mantenimiento (ver
// MaintenanceGate.tsx). Vive en /admin, no en Gestión, porque es un switch
// de "estado de la plataforma" — mismo lugar donde ya está Salud de la
// plataforma, no una tabla CRUD.
export function MaintenanceModePanel() {
  const { user } = useAuth()
  const { enabled, message, updatedAt } = useMaintenanceMode()
  const [messageDraft, setMessageDraft] = useState(message)
  const [messageDirty, setMessageDirty] = useState(false)
  const [savingToggle, setSavingToggle] = useState(false)
  const [savingMessage, setSavingMessage] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!messageDirty) setMessageDraft(message)
  }, [message, messageDirty])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!user) return null

  async function handleToggle() {
    if (!user || savingToggle) return
    setSavingToggle(true)
    setError(null)
    try {
      await setMaintenanceMode(user.uid, !enabled, message)
    } catch {
      setError('No se pudo cambiar el modo mantenimiento. Intenta de nuevo.')
    } finally {
      setSavingToggle(false)
    }
  }

  async function handleSaveMessage() {
    if (!user || savingMessage) return
    setSavingMessage(true)
    setError(null)
    try {
      await setMaintenanceMode(user.uid, enabled, messageDraft)
      setMessageDirty(false)
    } catch {
      setError('No se pudo guardar el mensaje. Intenta de nuevo.')
    } finally {
      setSavingMessage(false)
    }
  }

  const updatedLabel = formatUpdatedAt(updatedAt)

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {enabled ? 'Mantenimiento activado' : 'Mantenimiento desactivado'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {enabled
              ? 'Los usuarios ven la pantalla de mantenimiento en lugar de la app. /admin, el pase QR, RSVP y el escáner siguen funcionando.'
              : 'La app funciona con normalidad para todos.'}
            {updatedLabel && <> · Última actualización: {updatedLabel}</>}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Modo mantenimiento"
          onClick={handleToggle}
          disabled={savingToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-50 ${
            enabled ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <div className="mt-4">
        <label htmlFor="maintenance-message" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
          Mensaje personalizado (opcional — si lo dejas vacío se usa el texto por defecto)
        </label>
        <textarea
          id="maintenance-message"
          value={messageDraft}
          onChange={(e) => {
            setMessageDraft(e.target.value)
            setMessageDirty(true)
          }}
          rows={2}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="PaseLink está temporalmente fuera de servicio mientras realizamos algunas mejoras."
          className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5 resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-2xs text-gray-400 dark:text-gray-500">{messageDraft.length}/{MESSAGE_MAX_LENGTH}</span>
          <button
            type="button"
            onClick={handleSaveMessage}
            disabled={!messageDirty || savingMessage}
            className="text-sm font-medium text-primary hover:text-primary-dark disabled:opacity-40 disabled:hover:text-primary"
          >
            {savingMessage ? 'Guardando…' : 'Guardar mensaje'}
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
    </div>
  )
}
