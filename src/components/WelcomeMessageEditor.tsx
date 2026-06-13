import { useState } from 'react'
import { updateEventWelcomeMessage } from '../firebase/events'

export function WelcomeMessageEditor({ eventId, welcomeMessage }: { eventId: string; welcomeMessage: string }) {
  const [value, setValue] = useState(welcomeMessage)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await updateEventWelcomeMessage(eventId, value.trim())
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4 mb-4">
      <h2 className="font-medium text-gray-900 mb-1">Mensaje de bienvenida (Premium)</h2>
      <p className="text-sm text-gray-500 mb-2">
        Se mostrará al anfitrión al confirmar la asistencia de cada invitado.
      </p>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setSaved(false)
        }}
        rows={2}
        placeholder="¡Bienvenido/a! Disfruta la fiesta"
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm bg-primary text-white rounded-md px-3 py-1.5 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar mensaje'}
        </button>
        {saved && <span className="text-sm text-green-600">Guardado</span>}
      </div>
    </div>
  )
}
