import { useState } from 'react'
import { addGuest, addGuestsBulk } from '../firebase/guests'

export function GuestAddForm({ eventId }: { eventId: string }) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      await addGuest(eventId, { name: name.trim(), email: email.trim(), phone: phone.trim() })
      setName('')
      setEmail('')
      setPhone('')
    } finally {
      setLoading(false)
    }
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault()
    const names = bulkNames
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)
    if (names.length === 0) return
    setLoading(true)
    try {
      await addGuestsBulk(eventId, names)
      setBulkNames('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('single')}
          className={`text-sm px-3 py-1 rounded-md font-medium ${
            mode === 'single' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Agregar uno
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`text-sm px-3 py-1 rounded-md font-medium ${
            mode === 'bulk' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Agregar lista
        </button>
      </div>

      {mode === 'single' ? (
        <form onSubmit={handleSingleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            required
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary sm:col-span-1"
          />
          <input
            type="email"
            placeholder="Email (opcional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="tel"
            placeholder="Teléfono (opcional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="sm:col-span-3 bg-primary text-white rounded-md py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Agregando...' : 'Agregar invitado'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleBulkSubmit} className="space-y-3">
          <textarea
            placeholder={'Un nombre por línea\nEj.\nJuan Pérez\nMaría López'}
            value={bulkNames}
            onChange={(e) => setBulkNames(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white rounded-md py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Agregando...' : 'Agregar lista de invitados'}
          </button>
        </form>
      )}
    </div>
  )
}
