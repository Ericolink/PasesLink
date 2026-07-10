// Fuente única de verdad de los documentos legales que un usuario debe aceptar
// al registrarse. Subir un `version` aquí es lo único necesario para que:
// (a) Terms.tsx/Privacy.tsx muestren la fecha actualizada, y
// (b) getPendingLegalAcceptance detecte que un usuario aceptó una versión vieja.
export const LEGAL_DOCS = {
  terms: {
    id: 'terms',
    version: '2026-07-10',
    label: 'Términos y Condiciones',
    path: '/terminos',
  },
  privacy: {
    id: 'privacy',
    version: '2026-07-10',
    label: 'Política de Privacidad',
    path: '/privacidad',
  },
} as const

export type LegalDocId = keyof typeof LEGAL_DOCS

export const LEGAL_DOCS_LIST = Object.values(LEGAL_DOCS)

export type LegalAcceptedVersions = Partial<Record<LegalDocId, string>>

/**
 * Compara las versiones aceptadas por un usuario contra LEGAL_DOCS y devuelve
 * los documentos que quedaron desactualizados (o nunca aceptados). No se usa
 * todavía para bloquear acceso — queda listo para cuando se decida pedir
 * re-aceptación tras una futura actualización de términos.
 */
export function getPendingLegalAcceptance(accepted: LegalAcceptedVersions | undefined): typeof LEGAL_DOCS_LIST {
  return LEGAL_DOCS_LIST.filter((doc) => accepted?.[doc.id as LegalDocId] !== doc.version)
}

const LEGAL_DATE_FORMATTER = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })

/** Convierte el `version` ('YYYY-MM-DD') de un documento legal a "10 de julio de 2026". */
export function formatLegalDocDate(version: string): string {
  const d = new Date(version + 'T00:00:00')
  if (isNaN(d.getTime())) return version
  return LEGAL_DATE_FORMATTER.format(d)
}
