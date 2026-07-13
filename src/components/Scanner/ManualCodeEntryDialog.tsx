import { useModalA11y } from '../../hooks/useModalA11y'

interface Props {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

// Antes este formulario vivía como overlay absoluto dentro del recuadro de
// cámara (320px, overflow-hidden) — con el teclado abierto, el navegador
// intentaba llevar el input enfocado a la vista scrolleando ese recuadro
// (un contenedor overflow-hidden sigue siendo "scrolleable" por spec, solo
// que sin scrollbar visible ni gesto táctil), así que el botón "Procesar
// código" quedaba tapado por el teclado sin forma de alcanzarlo. Como
// diálogo fixed de pantalla completa (mismo patrón que ExitConfirmDialog/
// ScanResultModal) queda fuera de ese recuadro: el teclado empuja el layout
// normal del documento y el input enfocado siempre es alcanzable.
export function ManualCodeEntryDialog({ value, onChange, onSubmit, onCancel }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(true, onCancel)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-[env(safe-area-inset-bottom)] sm:pb-0"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ingresar código manualmente"
        className="bg-gray-800 text-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-sm w-full p-6 animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium text-gray-300 mb-3">Ingresar código manualmente</p>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit() }}
          className="flex flex-col gap-2"
        >
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Pega el enlace o código del pase"
            autoFocus
            className="min-h-12 w-full bg-gray-900 text-white placeholder:text-gray-500 rounded-lg px-3 py-3 text-sm border border-gray-700 focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="min-h-12 bg-primary text-white rounded-lg py-3 text-sm font-semibold hover:opacity-90"
          >
            Procesar código
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2"
          >
            Cancelar
          </button>
        </form>
      </div>
    </div>
  )
}
