import { useEffect, useState } from 'react'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import type { CommunityTemplate } from '../../types'
import { CommunityTemplatePreviewCard } from '../CommunityTemplatePreviewCard'
import { IconX } from '../accessibility/AccessibleIcon'
import { formatDateTimeMedium } from '../../utils/time'

interface Props {
  template: CommunityTemplate | null
  onClose: () => void
  onReview: (id: string, status: 'approved' | 'rejected' | 'archived', reviewNotes: string) => void
}

export function AdminCommunityTemplateDetail({ template, onClose, onReview }: Props) {
  const [notes, setNotes] = useState('')

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    setNotes(template?.reviewNotes || '')
  }, [template?.id])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  if (!template) return null
  const { vars } = template

  return (
    <AccessibleModal open={!!template} onClose={onClose} label={template.name} variant="dialog" maxWidth="max-w-lg">
      <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{template.category} · v{template.version}</p>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white break-words">{template.name}</h2>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="min-w-11 min-h-11 -m-2 inline-flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <IconX className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 py-4 space-y-4 overflow-y-auto">
        <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>Por {template.authorDisplayName}</span>
          <span>{formatDateTimeMedium(template.createdAt)}</span>
          {template.license && <span>Licencia: {template.license}</span>}
        </div>

        {template.description && (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
            {template.description}
          </p>
        )}

        <CommunityTemplatePreviewCard vars={vars} />

        {template.previewImageUrl && (
          <img src={template.previewImageUrl} alt="" className="w-full rounded-lg object-cover" />
        )}

        {template.compatibility.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Compatibilidad declarada por el autor</p>
            <div className="flex flex-wrap gap-1.5">
              {template.compatibility.map((c) => (
                <span key={c} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-2 py-0.5">{c}</span>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Notas de revisión (visibles para el autor)</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ej. por qué se rechaza, qué corregir…"
            className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5 resize-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
        {template.status !== 'approved' && (
          <button
            onClick={() => onReview(template.id, 'approved', notes)}
            className="text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md px-3 py-2"
          >
            Aprobar
          </button>
        )}
        {template.status !== 'rejected' && (
          <button
            onClick={() => onReview(template.id, 'rejected', notes)}
            className="text-sm font-medium text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md px-3 py-2"
          >
            Rechazar
          </button>
        )}
        {template.status === 'approved' && (
          <button
            onClick={() => onReview(template.id, 'archived', notes)}
            className="text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded-md px-3 py-2"
          >
            Archivar
          </button>
        )}
      </div>
    </AccessibleModal>
  )
}
