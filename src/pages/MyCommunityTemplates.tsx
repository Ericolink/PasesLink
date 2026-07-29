import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { deleteCommunityTemplate, subscribeToMyCommunityTemplates } from '../firebase/communityTemplates'
import type { CommunityTemplate, CommunityTemplateStatus } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { IconEdit, IconSparkles, IconTrash } from '../components/accessibility/AccessibleIcon'
import { LoadingInline } from '../components/LoadingInline'
import { EmptyState } from '../components/Empty'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AccessibleButton } from '../components/accessibility/AccessibleButton'
import { formatDateTimeMedium } from '../utils/time'

const STATUS_LABEL: Record<CommunityTemplateStatus, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  archived: 'Archivada',
}

const STATUS_CLASS: Record<CommunityTemplateStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  in_review: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
}

// "Mis envíos" del flujo de plantillas comunitarias — espejo autor de lo que
// AdminCommunityTemplatesTable ve del lado moderación. subscribeToMyCommunityTemplates
// ya acota la query a authorUid==uid (ver firestore.rules), así que este
// listener solo puede devolver los propios envíos, en cualquier estado.
export function MyCommunityTemplates() {
  useDocumentTitle('Mis plantillas')
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const [templates, setTemplates] = useState<CommunityTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<CommunityTemplate | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeToMyCommunityTemplates(user.uid, (items) => {
      setTemplates(items.sort((a, b) => b.createdAt - a.createdAt))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [user])

  async function handleDelete(template: CommunityTemplate) {
    setDeleting(true)
    try {
      await deleteCommunityTemplate(template.id)
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-gray-500">
          <Link to="/login" className="text-primary font-medium">Inicia sesión</Link> para ver tus plantillas.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mis plantillas</h1>
        <Link to="/my-templates/new" className="shrink-0">
          <AccessibleButton size="sm">+ Nueva</AccessibleButton>
        </Link>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Propone plantillas para el catálogo de PaseLink — el equipo las revisa antes de publicarlas.
      </p>

      {loading && <LoadingInline label="Cargando plantillas…" />}

      {!loading && templates.length === 0 && (
        <EmptyState
          icon={IconSparkles}
          title="Sin plantillas propuestas"
          description="Diseña un set de colores y tipografía y proponlo para el catálogo de PaseLink."
          ctaText="Proponer una plantilla"
          to="/my-templates/new"
        />
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border p-4 ${t.id === highlightId ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.category} · v{t.version}</p>
              </div>
              <span className={`shrink-0 text-2xs font-medium px-2 py-1 rounded-full ${STATUS_CLASS[t.status]}`}>
                {STATUS_LABEL[t.status]}
              </span>
            </div>

            {t.status === 'rejected' && t.reviewNotes && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-900/20 rounded-md px-2 py-1.5">
                {t.reviewNotes}
              </p>
            )}
            {t.status === 'approved' && t.publishedAt && (
              <p className="text-xs text-gray-400 mt-2">Publicada el {formatDateTimeMedium(t.publishedAt)}</p>
            )}

            {(t.status === 'draft' || t.status === 'rejected') && (
              <div className="flex gap-2 mt-3">
                <Link to={`/my-templates/${t.id}/edit`} className="flex-1">
                  <AccessibleButton variant="secondary" size="sm" className="w-full">
                    <IconEdit className="w-3.5 h-3.5" /> {t.status === 'rejected' ? 'Corregir y reenviar' : 'Continuar'}
                  </AccessibleButton>
                </Link>
                {t.status === 'draft' && (
                  <button
                    onClick={() => setConfirmDelete(t)}
                    className="shrink-0 min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    aria-label={`Eliminar plantilla ${t.name}`}
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="¿Eliminar este borrador?"
        message={confirmDelete && <span className="block font-medium text-gray-700 dark:text-gray-300">{confirmDelete.name}</span>}
        confirmLabel={deleting ? 'Eliminando…' : 'Sí, eliminar'}
        danger
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
