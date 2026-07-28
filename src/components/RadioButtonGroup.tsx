import type { ReactNode } from 'react'

// Extraído del patrón ya usado en EntryModeSelector.tsx (radiogroup real,
// no un grupo de botones toggle) — para no reescribir role="radiogroup" +
// role="radio"/aria-checked a mano cada vez que aparece un selector de
// opción única. Solo úsalo cuando las opciones son un estado persistido
// mutuamente excluyente (si son acciones distintas, un fieldset/legend es
// la semántica correcta, no esto — ver GuestPass.tsx RSVP).
interface RadioGroupProps {
  label: string
  className?: string
  children: ReactNode
}

export function RadioGroup({ label, className = '', children }: RadioGroupProps) {
  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {children}
    </div>
  )
}

interface RadioGroupOptionProps {
  selected: boolean
  onSelect: () => void
  className?: string
  children: ReactNode
}

export function RadioGroupOption({ selected, onSelect, className = '', children }: RadioGroupOptionProps) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={className}>
      {children}
    </button>
  )
}
