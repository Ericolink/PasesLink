import { useRef, useState } from 'react'
import { updateEventDetails } from '../firebase/events'
import { uploadImage } from '../utils/cloudinary'
import type { EventData } from '../types'

export function EditEventForm({ event, onDone }: { event: EventData; onDone: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(event.name)
  const [date, setDate] = useState(event.date)
  const [location, setLocation] = useState(event.location)
  const [description, setDescription] = useState(event.description || '')
  const [coverImage, setCoverImage] = useState(event.coverImage || '')
  const [accentColor, setAccentColor] = useState(event.accentColor || '#2563eb')
  const [welcomeMessage, setWelcomeMessage] = useState(event.welcomeMessage || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setCoverImage(url)
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !date || !location.trim()) return
    setSaving(true)
    try {
      await updateEventDetails(event.id, {
        name: name.trim(),
        date,
        location: location.trim(),
        description: description.trim(),
        coverImage,
        accentColor,
        welcomeMessage: welcomeMessage.trim(),
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4 space-y-3 animate-fade-in-up">
      <h2 className="font-medium text-gray-900 dark:text-white">Editar evento</h2>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del evento</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lugar</label>
          <input
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Personalización */}
      <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Personalización del pase</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Imagen de portada</label>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
          {coverImage ? (
            <div className="relative rounded-lg overflow-hidden h-28 bg-gray-100">
              <img src={coverImage} alt="Portada" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setCoverImage('')}
                className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-md px-2 py-1"
              >
                Quitar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-4 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {uploading ? 'Subiendo...' : '+ Subir imagen de portada'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color de acento</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-9 w-12 border border-gray-300 rounded-md cursor-pointer"
              />
              <span className="text-sm text-gray-500">{accentColor}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mensaje de bienvenida</label>
            <input
              type="text"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="¡Te esperamos!"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || uploading}
          className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border border-gray-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
