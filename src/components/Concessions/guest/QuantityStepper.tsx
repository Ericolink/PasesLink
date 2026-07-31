interface Props {
  value: number
  onIncrement: () => void
  onDecrement: () => void
  incrementDisabled?: boolean
  label: string
}

// Contador +/- del carrito de concessions — no existía ningún stepper
// numérico reutilizable en el repo (CompanionFieldsEditor es un editor de
// filas, no esto). Temeado con --invite-* porque solo vive del lado del
// invitado (el organizador nunca elige "cantidad" de nada). 36px (no 44px):
// es un control repetido varias veces por pantalla dentro de una fila densa,
// mismo criterio de escala ya documentado para otros controles chicos
// repetidos del panel de accesibilidad.
export function QuantityStepper({ value, onIncrement, onDecrement, incrementDisabled = false, label }: Props) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onDecrement}
        disabled={value <= 0}
        aria-label={`Quitar una unidad de ${label}`}
        className="min-w-9 min-h-9 inline-flex items-center justify-center rounded-full border text-[var(--invite-text)] disabled:opacity-30 transition-opacity"
        style={{ borderColor: 'var(--invite-border)' }}
      >
        −
      </button>
      <span className="w-5 text-center text-sm font-medium tabular-nums text-[var(--invite-text)]" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={incrementDisabled}
        aria-label={`Agregar una unidad de ${label}`}
        className="min-w-9 min-h-9 inline-flex items-center justify-center rounded-full text-white disabled:opacity-30 transition-opacity bg-[var(--invite-accent)]"
      >
        +
      </button>
    </div>
  )
}
