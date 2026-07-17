import { useState } from 'react'
import { LEGAL_DOCS, type LegalDocId } from '../legal/documents'
import { LegalDocumentSheet } from './LegalDocumentSheet'
import { Checkbox } from './Checkbox'

interface Props {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
}

// Checkbox de aceptación legal para el registro. Los nombres de los
// documentos son botones (no <a>) para no sacar al usuario del formulario —
// abren LegalDocumentSheet con el contenido inline. Un <button> dentro de un
// <label> no dispara el toggle del checkbox (tiene su propia "activation
// behavior" según el spec de HTML), así que el link y el checkbox no compiten.
export function LegalConsentCheckbox({ id, checked, onChange }: Props) {
  const [openDoc, setOpenDoc] = useState<LegalDocId | null>(null)

  return (
    <>
      <label htmlFor={id} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
        <Checkbox
          id={id}
          required
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 shrink-0"
        />
        <span>
          He leído y acepto los{' '}
          <button
            type="button"
            onClick={() => setOpenDoc('terms')}
            className="text-primary font-medium underline underline-offset-2"
          >
            {LEGAL_DOCS.terms.label}
          </button>{' '}
          y la{' '}
          <button
            type="button"
            onClick={() => setOpenDoc('privacy')}
            className="text-primary font-medium underline underline-offset-2"
          >
            {LEGAL_DOCS.privacy.label}
          </button>{' '}
          de PaseLink.
        </span>
      </label>
      <LegalDocumentSheet docId={openDoc} onClose={() => setOpenDoc(null)} />
    </>
  )
}
