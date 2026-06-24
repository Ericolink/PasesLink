import { useState } from 'react'
import { updateEventBranding } from '../firebase/events'

export function BrandingEditor({
  eventId,
  accentColor,
  logoUrl,
}: {
  eventId: string
  accentColor: string
  logoUrl: string
}) {
  const [color, setColor] = useState(accentColor || '#2563eb')
  const [logo, setLogo] = useState(logoUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await updateEventBranding(eventId, { accentColor: color, logoUrl: logo.trim() })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4 mb-4">
      <h2 className="font-medium text-gray-900 mb-1">Personalización (Premium)</h2>
      <p className="text-sm text-gray-500 mb-3">
        Se mostrarán en la página pública del pase de cada invitado.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Color de acento</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value)
                setSaved(false)
              }}
              className="h-10 w-14 border border-gray-300 rounded-md cursor-pointer"
            />
            <span className="text-sm text-gray-500">{color}</span>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL del logo (opcional)</label>
          <input
            type="text"
            value={logo}
            onChange={(e) => {
              setLogo(e.target.value)
              setSaved(false)
            }}
            placeholder="https://..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm bg-primary text-white rounded-md px-3 py-1.5 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar personalización'}
        </button>
        {saved && <span className="text-sm text-green-600">Guardado</span>}
      </div>
    </div>
  )
}
