import type { TransportInfo, TransportOption } from '../types'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { useReorderableList } from '../hooks/useReorderableList'
import { EVENT_SPECIAL_INSTRUCTIONS_MAX, EVENT_TRANSPORT_OPTIONS_MAX } from '../utils/validation'

const LABEL_MAX = 100
const DESCRIPTION_MAX = 200
const INSTRUCTION_MAX = 150
const PARKING_INFO_MAX = 500

interface Props {
  transport: TransportInfo
  onChange: (transport: TransportInfo) => void
}

export function TransportEditor({ transport, onChange }: Props) {
  const options = transport.options || []
  const specialInstructions = transport.specialInstructions || []

  const optionsList = useReorderableList<TransportOption>(
    options,
    (next) => onChange({ ...transport, options: next }),
    { max: EVENT_TRANSPORT_OPTIONS_MAX },
  )

  function addInstruction() {
    if (specialInstructions.length >= EVENT_SPECIAL_INSTRUCTIONS_MAX) return
    onChange({ ...transport, specialInstructions: [...specialInstructions, ''] })
  }

  function updateInstruction(index: number, value: string) {
    onChange({ ...transport, specialInstructions: specialInstructions.map((s, i) => (i === index ? value : s)) })
  }

  function removeInstruction(index: number) {
    onChange({ ...transport, specialInstructions: specialInstructions.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Opciones de transporte</p>
        {options.length === 0 && (
          <p className="text-xs text-gray-400">Ej: Shuttle desde el hotel, Uber recomendado, Transporte privado.</p>
        )}
        {options.map((opt, index) => (
          <div key={opt.id} className="flex gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                value={opt.label}
                maxLength={LABEL_MAX}
                onChange={(e) => optionsList.update(opt.id, { label: e.target.value })}
                placeholder="Nombre (ej: Uber recomendado)"
                aria-label={`Opción de transporte ${index + 1}`}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
              />
              <input
                type="text"
                value={opt.description || ''}
                maxLength={DESCRIPTION_MAX}
                onChange={(e) => optionsList.update(opt.id, { description: e.target.value })}
                placeholder="Detalle opcional"
                aria-label={`Detalle de la opción de transporte ${index + 1}`}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
              />
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <AccessibleButton iconOnly variant="text" onClick={() => optionsList.moveUp(opt.id)} disabled={index === 0} aria-label={`Subir opción ${index + 1}`} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">▲</AccessibleButton>
              <AccessibleButton iconOnly variant="text" onClick={() => optionsList.moveDown(opt.id)} disabled={index === options.length - 1} aria-label={`Bajar opción ${index + 1}`} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">▼</AccessibleButton>
              <AccessibleButton iconOnly variant="text" onClick={() => optionsList.remove(opt.id)} aria-label={`Quitar opción ${index + 1}`} className="text-gray-400 hover:text-red-500 text-lg leading-none">×</AccessibleButton>
            </div>
          </div>
        ))}
        {optionsList.canAdd && (
          <button type="button" onClick={() => optionsList.add({ id: crypto.randomUUID(), label: '', description: '' })} className="text-sm text-primary font-medium hover:underline">
            + Agregar opción de transporte
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide" htmlFor="transport-parking-info">
          Estacionamiento
        </label>
        <textarea
          id="transport-parking-info"
          value={transport.parkingInfo || ''}
          maxLength={PARKING_INFO_MAX}
          onChange={(e) => onChange({ ...transport, parkingInfo: e.target.value })}
          placeholder="Ej: Estacionamiento gratuito en el lugar, cupo limitado. Valet disponible por $100."
          rows={2}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 resize-y"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Indicaciones especiales</p>
        {specialInstructions.length === 0 && (
          <p className="text-xs text-gray-400">Ej: Entrada por acceso norte, Registro obligatorio, Código de acceso.</p>
        )}
        {specialInstructions.map((instruction, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={instruction}
              maxLength={INSTRUCTION_MAX}
              onChange={(e) => updateInstruction(index, e.target.value)}
              placeholder={`Indicación ${index + 1}`}
              aria-label={`Indicación especial ${index + 1}`}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
            />
            <AccessibleButton iconOnly variant="text" onClick={() => removeInstruction(index)} aria-label={`Quitar indicación ${index + 1}`} className="text-gray-400 hover:text-red-500 shrink-0 text-lg leading-none">×</AccessibleButton>
          </div>
        ))}
        {specialInstructions.length < EVENT_SPECIAL_INSTRUCTIONS_MAX && (
          <button type="button" onClick={addInstruction} className="text-sm text-primary font-medium hover:underline">
            + Agregar indicación
          </button>
        )}
      </div>
    </div>
  )
}
