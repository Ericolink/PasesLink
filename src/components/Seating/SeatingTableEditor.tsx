import { useState } from 'react'
import type { SeatingTableData, SeatingTableShape } from '../../types'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { InputField } from '../accessibility/AccessibleField'
import { RadioGroup, RadioGroupOption } from '../accessibility/AccessibleField/RadioGroup'

const SHAPE_LABELS: Record<SeatingTableShape, string> = {
  round: 'Redonda',
  rectangular: 'Rectangular',
  square: 'Cuadrada',
  custom: 'Otra',
}

const NAME_MAX = 60
const ZONE_MAX = 60

interface Props {
  open: boolean
  onClose: () => void
  table: SeatingTableData | null
  onSave: (input: { name: string; capacity: number; shape: SeatingTableShape; zone?: string }) => Promise<void>
}

// Alta/edición de una mesa — modal separado de TableCard (que solo
// muestra/opera una mesa ya creada) para no mezclar el formulario con la
// vista de ocupación en vivo.
export function SeatingTableEditor({ open, onClose, table, onSave }: Props) {
  const [name, setName] = useState(table?.name ?? '')
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 8))
  const [shape, setShape] = useState<SeatingTableShape>(table?.shape ?? 'round')
  const [zone, setZone] = useState(table?.zone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const capacityNumber = Math.trunc(Number(capacity))
  const isValid = name.trim().length > 0 && capacityNumber > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    setSaving(true)
    setError('')
    try {
      await onSave({ name: name.trim(), capacity: capacityNumber, shape, zone: zone.trim() || undefined })
      onClose()
    } catch {
      setError('No se pudo guardar la mesa. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AccessibleModal open={open} onClose={onClose} label={table ? 'Editar mesa' : 'Nueva mesa'} variant="dialog">
      <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{table ? 'Editar mesa' : 'Nueva mesa'}</h2>
        <InputField
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          required
          placeholder='Ej. "Mesa 5" o "Mesa de honor"'
        />
        <InputField
          label="Capacidad (personas)"
          type="number"
          inputMode="numeric"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
        />
        <RadioGroup label="Forma">
          <div className="flex flex-wrap gap-2 mt-1">
            {(Object.keys(SHAPE_LABELS) as SeatingTableShape[]).map((value) => (
              <RadioGroupOption
                key={value}
                selected={shape === value}
                onSelect={() => setShape(value)}
                className={`px-3 py-2 rounded-lg text-sm border min-h-11 ${
                  shape === value
                    ? 'border-primary bg-primary-subtle text-primary-ink dark:text-primary'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                }`}
              >
                {SHAPE_LABELS[value]}
              </RadioGroupOption>
            ))}
          </div>
        </RadioGroup>
        <InputField
          label="Salón / zona (opcional)"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          maxLength={ZONE_MAX}
          placeholder='Ej. "Salón principal", "Terraza"'
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <AccessibleButton type="button" variant="secondary" onClick={onClose}>Cancelar</AccessibleButton>
          <AccessibleButton type="submit" variant="primary" disabled={!isValid} loading={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </AccessibleButton>
        </div>
      </form>
    </AccessibleModal>
  )
}
