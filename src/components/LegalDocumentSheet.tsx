import { TermsContent } from '../pages/Terms'
import { PrivacyContent } from '../pages/Privacy'
import type { LegalDocId } from '../legal/documents'
import { Modal } from './Modal'
import { DialogHeader } from './DialogHeader'

interface Props {
  docId: LegalDocId | null
  onClose: () => void
}

// Muestra el contenido de Términos/Privacidad sin sacar al usuario del
// formulario de registro (evita perder lo ya tecleado). Antes era el único
// sheet sin título en el header (solo la X) — sumarlo lo alinea con el resto
// (hallazgo C5 de la auditoría) además de ser más claro por sí mismo.
export function LegalDocumentSheet({ docId, onClose }: Props) {
  const title = docId === 'terms' ? 'Términos y condiciones' : 'Política de privacidad'

  return (
    <Modal open={!!docId} onClose={onClose} label={title} maxWidth="sm:max-w-lg">
      <DialogHeader title={title} onClose={onClose} />
      <div className="px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 pt-2 overflow-y-auto">
        {docId === 'terms' ? <TermsContent /> : <PrivacyContent />}
      </div>
    </Modal>
  )
}
