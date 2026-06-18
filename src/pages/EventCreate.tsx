import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createEvent } from '../firebase/events'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { optimizedImageUrl } from '../utils/cloudinary'
import { ImageCropModal } from '../components/ImageCropModal'
import { CustomFieldsBuilder } from '../components/CustomFieldsBuilder'
import type { CustomField, EntryMode } from '../types'

export function EventCreate() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const {
    fileInputRef: coverFileInputRef,
    coverImage,
    rawImage: coverRawImage,
    uploading: coverUploading,
    error: coverError,
    openPicker: openCoverPicker,
    onFileSelected: onCoverFileSelected,
    onCropConfirmed: onCoverCropConfirmed,
    onCropCancelled: onCoverCropCancelled,
    clearCover,
  } = useCoverPhoto()

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [accentColor, setAccentColor] = useState('#2563eb')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [mapsUrl, setMapsUrl] = useState('')
  const [entryMode, setEntryMode] = useState<EntryMode>('list')
  const [capacity, setCapacity] = useState('')
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setError('')
    setLoading(true)
    try {
      const eventId = await createEvent(user.uid, {
        name,
        date,
        location,
        description,
        coverImage,
        accentColor,
        welcomeMessage,
        mapsUrl: mapsUrl.trim() || undefined,
        entryMode,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
        customFields,
      })
      navigate(`/events/${eventId}`)
    } catch {
      setError('No pudimos crear el evento. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    {coverRawImage && (
      <ImageCropModal
        imageSrc={coverRawImage}
        onCrop={onCoverCropConfirmed}
        onCancel={onCoverCropCancelled}
      />
    )}
    <div className="max-w-2xl mx-auto px-4 py-8 animate-fade-in">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Crear evento</h1>
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Datos del evento */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del evento</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mi graduación"
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lugar</label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Salón Los Olivos"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Link de Google Maps <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="url"
            value={mapsUrl}
            onChange={(e) => setMapsUrl(e.target.value)}
            placeholder="https://maps.google.com/maps?q=..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-gray-400 mt-1">
            Para ver el mapa integrado, pega el link <strong>completo</strong> de Google Maps (desde el navegador, no el link corto). El botón "Cómo llegar" funciona con cualquier link.
          </p>
        </div>

        {/* Personalización */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Personalización del pase</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Imagen de portada</label>
            <input ref={coverFileInputRef} type="file" accept="image/*" onChange={onCoverFileSelected} className="hidden" />
            {coverImage ? (
              <div className="relative rounded-lg overflow-hidden h-32 bg-gray-100">
                <img src={optimizedImageUrl(coverImage, 800)} alt="Portada" loading="lazy" className="w-full h-full object-cover" />
                <button type="button" onClick={clearCover} className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-md px-2 py-1">
                  Quitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openCoverPicker}
                disabled={coverUploading}
                className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-6 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {coverUploading ? 'Subiendo...' : '+ Subir imagen de portada'}
              </button>
            )}
            {coverError && <p className="text-xs text-red-500 mt-1.5">{coverError}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color de acento</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-14 border border-gray-300 rounded-md cursor-pointer"
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

        {/* Campos personalizados del registro */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Campos de registro</h2>
            <p className="text-xs text-gray-500 mt-0.5">Los invitados siempre ingresan nombre y teléfono. Puedes agregar campos extra.</p>
          </div>
          <div className="flex gap-2 text-xs text-gray-400 border border-gray-100 dark:border-gray-700 rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-700/30">
            <span className="font-medium text-gray-600 dark:text-gray-300">Fijos:</span> Nombre · Teléfono
          </div>
          <CustomFieldsBuilder fields={customFields} onChange={setCustomFields} />
        </div>

        {/* Modo de ingreso */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Modo de ingreso</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { id: 'list', label: 'Lista cerrada', desc: 'Solo invitados con QR propio' },
              { id: 'open', label: 'Ingreso libre', desc: 'Cualquiera entra hasta el cupo' },
              { id: 'hybrid', label: 'Mixto', desc: 'Lista + ingreso libre combinados' },
            ] as { id: EntryMode; label: string; desc: string }[]).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setEntryMode(m.id)}
                className={`text-left border rounded-lg p-3 transition-all ${
                  entryMode === m.id
                    ? 'border-primary ring-2 ring-primary/20 bg-primary-light'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-semibold text-gray-900 dark:text-white">{m.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
              </button>
            ))}
          </div>
          {entryMode !== 'list' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cupo máximo de personas
              </label>
              <input
                type="number"
                min="1"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="Ej: 200"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
        </div>

        <p className="text-sm text-center text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
          🎉 Todas las funciones Premium (reportes, recordatorios, notificaciones) están incluidas gratis
          mientras damos a conocer el servicio.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || coverUploading}
          className="w-full bg-primary text-white rounded-md py-2.5 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-md"
        >
          {loading ? 'Creando...' : 'Crear evento'}
        </button>
      </form>
    </div>
    </>
  )
}
