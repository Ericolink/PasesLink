import type { CompanionData } from '../types'
import { IconTrash } from './Icons'

export function CompanionFieldsEditor({
  companions,
  onChange,
}: {
  companions: CompanionData[]
  onChange: (companions: CompanionData[]) => void
}) {
  function addCompanion() {
    onChange([...companions, {}])
  }

  function removeCompanion(index: number) {
    onChange(companions.filter((_, i) => i !== index))
  }

  function updateCompanion(index: number, field: keyof CompanionData, value: string) {
    onChange(companions.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-600">Acompañantes</label>
        <button
          type="button"
          onClick={addCompanion}
          className="text-xs text-primary font-medium hover:underline"
        >
          + Agregar acompañante
        </button>
      </div>
      {companions.map((companion, index) => (
        <div key={index} className="grid grid-cols-3 gap-2 items-center bg-gray-50 rounded-md p-2">
          <input
            type="text"
            placeholder="Nombre (opcional)"
            value={companion.name || ''}
            onChange={(e) => updateCompanion(index, 'name', e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            placeholder="Apellido (opcional)"
            value={companion.lastName || ''}
            onChange={(e) => updateCompanion(index, 'lastName', e.target.value)}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex items-center gap-1">
            <input
              type="tel"
              placeholder="Teléfono (opcional)"
              value={companion.phone || ''}
              onChange={(e) => updateCompanion(index, 'phone', e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => removeCompanion(index)}
              className="shrink-0 text-gray-400 hover:text-red-500 transition-colors p-1"
              aria-label="Eliminar acompañante"
            >
              <IconTrash className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
