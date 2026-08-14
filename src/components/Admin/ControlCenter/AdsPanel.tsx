import { useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useAdsConfig } from '../../../hooks/useAdsConfig'
import { setAdsConfig } from '../../../firebase/platformConfig'
import { AD_PLACEMENTS, AD_PLACEMENT_LABELS, type AdPlacement } from '../../../types/ads'

function formatUpdatedAt(updatedAt: ReturnType<typeof useAdsConfig>['updatedAt']): string | null {
  if (!updatedAt) return null
  return updatedAt.toDate().toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })
}

// Único control de encendido/apagado de la publicidad (ver AdSlot.tsx y
// AD_PLACEMENTS_AUDIT). Mismo criterio que MaintenanceModePanel: vive en
// /admin porque es un switch de "estado de la plataforma", no una tabla
// CRUD. El switch global apaga los dos placements de un golpe sin perder el
// estado individual de cada uno (útil para retirar publicidad rápido si
// afecta UX, sin perder qué placements estaban activos al reactivar).
export function AdsPanel() {
  const { user } = useAuth()
  const { enabled, placements, updatedAt } = useAdsConfig()
  const [saving, setSaving] = useState<AdPlacement | 'global' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!user) return null

  async function handleToggleGlobal() {
    if (!user || saving) return
    setSaving('global')
    setError(null)
    try {
      await setAdsConfig(user.uid, !enabled, placements)
    } catch {
      setError('No se pudo cambiar el estado de la publicidad. Intenta de nuevo.')
    } finally {
      setSaving(null)
    }
  }

  async function handleTogglePlacement(placement: AdPlacement) {
    if (!user || saving) return
    setSaving(placement)
    setError(null)
    try {
      await setAdsConfig(user.uid, enabled, { ...placements, [placement]: !placements[placement] })
    } catch {
      setError('No se pudo cambiar el placement. Intenta de nuevo.')
    } finally {
      setSaving(null)
    }
  }

  const updatedLabel = formatUpdatedAt(updatedAt)

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {enabled ? 'Publicidad activada' : 'Publicidad desactivada'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {enabled
              ? 'Se muestran los placements marcados abajo. Apagar este switch los oculta todos al instante.'
              : 'Ningún placement se muestra, aunque esté marcado abajo. No se carga ningún script de AdSense.'}
            {updatedLabel && <> · Última actualización: {updatedLabel}</>}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Publicidad"
          onClick={handleToggleGlobal}
          disabled={saving !== null}
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

      <div className="mt-4 space-y-2">
        {AD_PLACEMENTS.map((placement) => (
          <div key={placement} className="flex items-center justify-between gap-4 py-1.5">
            <div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{AD_PLACEMENT_LABELS[placement]}</p>
              <code className="text-2xs text-gray-400 dark:text-gray-500">{placement}</code>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={placements[placement]}
              aria-label={AD_PLACEMENT_LABELS[placement]}
              onClick={() => handleTogglePlacement(placement)}
              disabled={saving !== null}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 disabled:opacity-50 ${
                placements[placement] ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  placements[placement] ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
    </div>
  )
}
