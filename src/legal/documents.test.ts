import { describe, expect, it } from 'vitest'
import { ACCEPTANCE_REQUIRED_DOCS, LEGAL_DOCS, LEGAL_DOCS_LIST, getPendingLegalAcceptance } from './documents'

describe('legal/documents', () => {
  it('ACCEPTANCE_REQUIRED_DOCS incluye solo Términos y Privacidad, no Cookies', () => {
    const ids = ACCEPTANCE_REQUIRED_DOCS.map((d) => d.id)
    expect(ids).toEqual(['terms', 'privacy'])
    expect(LEGAL_DOCS.cookies.requiresAcceptance).toBe(false)
  })

  it('LEGAL_DOCS_LIST sigue incluyendo los 3 documentos (para mostrar versión/fecha en cada página)', () => {
    expect(LEGAL_DOCS_LIST.map((d) => d.id)).toEqual(['terms', 'privacy', 'cookies'])
  })

  it('sin ninguna aceptación previa: los dos documentos que exigen aceptación quedan pendientes', () => {
    const pending = getPendingLegalAcceptance(undefined)
    expect(pending.map((d) => d.id)).toEqual(['terms', 'privacy'])
  })

  it('con las versiones vigentes ya aceptadas: no queda nada pendiente', () => {
    const pending = getPendingLegalAcceptance({ terms: LEGAL_DOCS.terms.version, privacy: LEGAL_DOCS.privacy.version })
    expect(pending).toEqual([])
  })

  it('con una versión vieja de un solo documento: solo ese queda pendiente', () => {
    const pending = getPendingLegalAcceptance({ terms: '2020-01-01', privacy: LEGAL_DOCS.privacy.version })
    expect(pending.map((d) => d.id)).toEqual(['terms'])
  })
})
