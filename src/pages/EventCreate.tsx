import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { createEvent } from '../firebase/events'
import { uploadImage } from '../utils/cloudinary'
import type { EntryMode, Plan } from '../types'

const PLANS: { id: Plan; title: string; price: string; features: string[] }[] = [
  {
    id: 'basic',
    title: 'Básico',
    price: '$9 / evento',
    features: ['Invitados ilimitados', 'QR individual por invitado', 'Check-in en tiempo real'],
  },
  {
    id: 'premium',
    title: 'Premium',
    price: '$19 / evento',
    features: [
      'Todo lo del plan Básico',
      'Reportes detallados de asistencia',
      'Notificaciones de check-in en tiempo real',
      'Recordatorios automáticos a invitados',
      'Soporte prioritario',
    ],
  },
]

export function EventCreate() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [coverImage, setCoverImage] = useState('')
  const [accentColor, setAccentColor] = useState('#2563eb')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [entryMode, setEntryMode] = useState<EntryMode>('list')
  const [capacity, setCapacity] = useState('')
  const [plan, setPlan] = useState<Plan>('basic')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setCoverImage(url)
    } catch {
      setError('No pudimos subir la imagen. Intenta de nuevo.')
    } finally {
      setUploading(false)
    }
  }

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
        entryMode,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
        plan,
      })
      navigate(`/events/${eventId}/checkout`)
    } catch {
      setError('No pudimos crear el evento. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
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

        {/* Personalización */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Personalización del pase</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Imagen de portada</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            {coverImage ? (
              <div className="relative rounded-lg overflow-hidden h-32 bg-gray-100">
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
                className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-6 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              >
                {uploading ? 'Subiendo...' : '+ Subir imagen de portada'}
              </button>
            )}
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

        {/* Plan */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Elige tu plan</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlan(p.id)}
                className={`text-left border rounded-lg p-4 transition-all ${
                  plan === p.id
                    ? 'border-primary ring-2 ring-primary/20 scale-[1.02]'
                    : 'border-gray-200 hover:border-gray-300 hover:scale-[1.01]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900 dark:text-white">{p.title}</span>
                  <span className="text-sm font-medium text-primary">{p.price}</span>
                </div>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  {p.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || uploading}
          className="w-full bg-primary text-white rounded-md py-2.5 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-md"
        >
          {loading ? 'Creando...' : 'Continuar al pago'}
        </button>
      </form>
    </div>
  )
}
