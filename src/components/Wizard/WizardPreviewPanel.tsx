import { useState, type ReactNode } from 'react'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { IconEye, IconX } from '../accessibility/AccessibleIcon'

interface WizardPreviewPanelProps {
  preview: ReactNode
  label: string
}

// Columna sticky en desktop (`lg:` en adelante — dos columnas necesitan más
// ancho que el breakpoint `sm:` que ya usa la navegación del wizard, ver
// WizardContainer.tsx) + botón flotante con hoja inferior en mobile/tablet,
// donde no entran dos columnas. El botón flotante cumple dos objetivos con
// un solo componente: acceso al preview en pantallas chicas y el "ver
// invitación completa" que pide siempre estar disponible.
export function WizardPreviewPanel({ preview, label }: WizardPreviewPanelProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <>
      <aside
        aria-label={label}
        className="hidden lg:block sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 py-4"
      >
        {preview}
      </aside>

      <div className="lg:hidden fixed z-30 bottom-24 sm:bottom-6 right-4">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-2 rounded-full bg-primary text-white shadow-[var(--shadow-lg)] px-4 py-3 text-sm font-medium"
        >
          <IconEye className="w-4 h-4" />
          Ver invitación
        </button>
      </div>

      <AccessibleModal open={sheetOpen} onClose={() => setSheetOpen(false)} label={label} variant="sheet" maxWidth="sm:max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Cerrar vista previa"
            className="p-1.5 -mr-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto">{preview}</div>
      </AccessibleModal>
    </>
  )
}
