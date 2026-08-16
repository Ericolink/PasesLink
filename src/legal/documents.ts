// Fuente única de verdad de los documentos legales de PaseLink. Subir un
// `version` aquí es lo único necesario para que: (a) el contenido (Terms.tsx/
// Privacy.tsx/Cookies.tsx) muestre la fecha actualizada, y (b)
// getPendingLegalAcceptance detecte que un usuario aceptó una versión vieja
// y el LegalAcceptanceGate le pida re-aceptar.
//
// `requiresAcceptance: false` (hoy solo Cookies) marca un documento
// informativo: se versiona y se muestra igual que los demás, pero no forma
// parte del checkbox obligatorio de registro ni del gate de re-aceptación —
// PaseLink no usa cookies propias, así que no hay nada que "aceptar" ahí en
// el sentido de un consentimiento activo (ver Cookies.tsx).
export const LEGAL_DOCS = {
  terms: {
    id: 'terms',
    version: '2026-08-15',
    label: 'Términos y Condiciones',
    path: '/terminos',
    requiresAcceptance: true,
  },
  privacy: {
    id: 'privacy',
    version: '2026-08-15',
    label: 'Política de Privacidad',
    path: '/privacidad',
    requiresAcceptance: true,
  },
  cookies: {
    id: 'cookies',
    version: '2026-08-15',
    label: 'Aviso de Cookies',
    path: '/cookies',
    requiresAcceptance: false,
  },
} as const

export type LegalDocId = keyof typeof LEGAL_DOCS

export const LEGAL_DOCS_LIST = Object.values(LEGAL_DOCS)

// Subconjunto que sí exige aceptación activa (checkbox de registro + gate de
// re-aceptación). Hoy: Términos y Privacidad.
export const ACCEPTANCE_REQUIRED_DOCS = LEGAL_DOCS_LIST.filter((doc) => doc.requiresAcceptance)

export type LegalAcceptedVersions = Partial<Record<LegalDocId, string>>

/**
 * Compara las versiones aceptadas por un usuario contra ACCEPTANCE_REQUIRED_DOCS
 * y devuelve los documentos que quedaron desactualizados (o nunca aceptados).
 * La usa LegalAcceptanceGate para pedir re-aceptación cuando corresponde.
 */
export function getPendingLegalAcceptance(
  accepted: LegalAcceptedVersions | undefined,
): typeof ACCEPTANCE_REQUIRED_DOCS {
  return ACCEPTANCE_REQUIRED_DOCS.filter((doc) => accepted?.[doc.id as LegalDocId] !== doc.version)
}

const LEGAL_DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

/** Convierte el `version` ('YYYY-MM-DD') de un documento legal a "10 de julio de 2026". */
export function formatLegalDocDate(version: string): string {
  const d = new Date(version + 'T00:00:00')
  if (isNaN(d.getTime())) return version
  return LEGAL_DATE_FORMATTER.format(d)
}
