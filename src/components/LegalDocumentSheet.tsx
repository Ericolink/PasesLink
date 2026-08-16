import type { ReactElement } from 'react'
import { TermsContent } from '../pages/Terms'
import { PrivacyContent } from '../pages/Privacy'
import { CookiesContent } from '../pages/Cookies'
import { LEGAL_DOCS, formatLegalDocDate, type LegalDocId } from '../legal/documents'
import { AccessibleModal } from './accessibility/AccessibleModal'
import { DialogHeader } from './DialogHeader'

interface Props {
  docId: LegalDocId | null
  onClose: () => void
}

const DOC_CONTENT: Record<LegalDocId, () => ReactElement> = {
  terms: TermsContent,
  privacy: PrivacyContent,
  cookies: CookiesContent,
}

// Muestra el contenido de Términos/Privacidad/Cookies sin sacar al usuario
// del formulario de registro (evita perder lo ya tecleado). Antes era el
// único sheet sin título en el header (solo la X) — sumarlo lo alinea con el
// resto (hallazgo C5 de la auditoría) además de ser más claro por sí mismo.
export function LegalDocumentSheet({ docId, onClose }: Props) {
  const doc = docId ? LEGAL_DOCS[docId] : null
  const Content = docId ? DOC_CONTENT[docId] : null

  return (
    <AccessibleModal open={!!docId} onClose={onClose} label={doc?.label ?? ''} maxWidth="sm:max-w-lg">
      <DialogHeader title={doc?.label ?? ''} onClose={onClose} />
      <div className="px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 pt-2 overflow-y-auto">
        {doc && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Versión {doc.version} · Última actualización: {formatLegalDocDate(doc.version)}
          </p>
        )}
        {Content && <Content />}
      </div>
    </AccessibleModal>
  )
}
