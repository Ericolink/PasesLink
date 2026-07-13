import { createPortal } from 'react-dom'
import { useModalA11y } from '../hooks/useModalA11y'
import { IconX } from './Icons'
import { TermsContent } from '../pages/Terms'
import { PrivacyContent } from '../pages/Privacy'
import type { LegalDocId } from '../legal/documents'

interface Props {
  docId: LegalDocId | null
  onClose: () => void
}

// Muestra el contenido de Términos/Privacidad sin sacar al usuario del
// formulario de registro (evita perder lo ya tecleado). Mismo patrón visual
// y de accesibilidad que WelcomeModal.tsx.
export function LegalDocumentSheet({ docId, onClose }: Props) {
  const dialogRef = useModalA11y<HTMLDivElement>(!!docId, onClose)

  if (!docId) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={docId === 'terms' ? 'Términos y condiciones' : 'Política de privacidad'}
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[85dvh] flex flex-col animate-bounce-in"
      >
        <div className="flex justify-end p-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 pt-2 overflow-y-auto">
          {docId === 'terms' ? <TermsContent /> : <PrivacyContent />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
