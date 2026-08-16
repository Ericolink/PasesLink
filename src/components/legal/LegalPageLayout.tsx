import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { LEGAL_DOCS, formatLegalDocDate, type LegalDocId } from '../../legal/documents'

interface LegalPageLayoutProps {
  docId: LegalDocId
  /** Tabla de contenido: debe calzar con los `id` de cada <LegalSection>. */
  sections: { id: string; title: string }[]
  children: ReactNode
}

// Chrome compartido por las 3 páginas legales (Terms/Privacy/Cookies):
// título + versión/fecha, navegación cruzada entre los 3 documentos, índice
// con anclas, y el propio contenido. Solo se usa en la página completa — el
// modal de registro (LegalDocumentSheet) sigue mostrando el contenido "pelado"
// (sin este chrome) para no competir con su propio encabezado del diálogo.
export function LegalPageLayout({ docId, sections, children }: LegalPageLayoutProps) {
  const doc = LEGAL_DOCS[docId]

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 animate-fade-in">
      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white mb-2">{doc.label}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Versión {doc.version} · Última actualización: {formatLegalDocDate(doc.version)}
        </p>
      </header>

      <nav aria-label="Documentos legales de PaseLink" className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-8">
        {Object.values(LEGAL_DOCS).map((d) => (
          <Link
            key={d.id}
            to={d.path}
            aria-current={d.id === docId ? 'page' : undefined}
            className={
              d.id === docId
                ? 'font-medium text-primary'
                : 'text-gray-500 dark:text-gray-400 hover:text-primary transition-colors'
            }
          >
            {d.label}
          </Link>
        ))}
      </nav>

      {sections.length > 0 && (
        <nav
          aria-label={`Índice de ${doc.label}`}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-5 mb-10"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Contenido
          </p>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm list-decimal list-inside">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-gray-700 dark:text-gray-300 hover:text-primary transition-colors">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="space-y-10">{children}</div>

      <Link to="/" className="inline-block mt-12 text-sm text-primary font-medium">
        Volver al inicio
      </Link>
    </div>
  )
}

interface LegalSectionProps {
  id: string
  title: string
  children: ReactNode
}

// Una sección numerada/anclada. `scroll-mt` compensa el navbar fijo del
// PublicLayout para que el ancla no quede tapada al saltar desde el índice.
export function LegalSection({ id, title, children }: LegalSectionProps) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{children}</div>
    </section>
  )
}
