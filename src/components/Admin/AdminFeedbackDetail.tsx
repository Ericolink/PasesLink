import { useEffect, useState } from 'react'
import { Modal } from '../Modal'
import type { Feedback, FeedbackPriority, FeedbackStatus } from '../../types'
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_PRIORITY_LABELS, FEEDBACK_STATUS_LABELS } from '../../types'
import { FeedbackCategoryIcon } from '../FeedbackCategoryIcon'
import { IconStar, IconTrash, IconX } from '../Icons'

interface Props {
  feedback: Feedback | null
  onClose: () => void
  onStatusChange: (id: string, status: FeedbackStatus) => void
  onPriorityChange: (id: string, priority: FeedbackPriority) => void
  onSaveTags: (id: string, tags: string[]) => void
  onSaveNotes: (id: string, notes: string) => void
  onToggleFavorite: (item: Feedback) => void
  onRequestDelete: (item: Feedback) => void
}

export function AdminFeedbackDetail({
  feedback,
  onClose,
  onStatusChange,
  onPriorityChange,
  onSaveTags,
  onSaveNotes,
  onToggleFavorite,
  onRequestDelete,
}: Props) {
  const [notesDraft, setNotesDraft] = useState('')
  const [tagInput, setTagInput] = useState('')

  // Sincroniza el borrador de notas solo cuando cambia EL mensaje mostrado
  // (por id), no en cada render — si dependiera de `feedback.adminNotes`
  // directo, un guardado propio (que actualiza `feedback` desde arriba)
  // pisaría lo que el admin esté escribiendo en ese instante.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    setNotesDraft(feedback?.adminNotes || '')
    setTagInput('')
  }, [feedback?.id])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  if (!feedback) return null

  function addTag() {
    const value = tagInput.trim()
    if (!value || !feedback || feedback.tags.includes(value)) { setTagInput(''); return }
    onSaveTags(feedback.id, [...feedback.tags, value])
    setTagInput('')
  }

  function removeTag(tag: string) {
    if (!feedback) return
    onSaveTags(feedback.id, feedback.tags.filter((t) => t !== tag))
  }

  const notesChanged = notesDraft !== feedback.adminNotes

  return (
    <Modal open={!!feedback} onClose={onClose} label={feedback.subject} variant="dialog" maxWidth="max-w-lg">
      <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            <FeedbackCategoryIcon category={feedback.category} className="w-4 h-4" />
            {FEEDBACK_CATEGORY_LABELS[feedback.category]}
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white break-words">{feedback.subject}</h2>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="min-w-11 min-h-11 -m-2 inline-flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <IconX className="w-5 h-5" />
        </button>
      </div>

      <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>{feedback.userEmail || feedback.userDisplayName || (feedback.userId ? 'Usuario registrado' : 'Anónimo')}</span>
            <span>{new Date(feedback.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
            {feedback.message}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Estado
              <select
                value={feedback.status}
                onChange={(e) => onStatusChange(feedback.id, e.target.value as FeedbackStatus)}
                className="mt-1 w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
              >
                {Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Prioridad
              <select
                value={feedback.priority}
                onChange={(e) => onPriorityChange(feedback.id, e.target.value as FeedbackPriority)}
                className="mt-1 w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
              >
                {Object.entries(FEEDBACK_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {feedback.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full pl-2 pr-1 py-0.5">
                  {tag}
                  <button onClick={() => removeTag(tag)} aria-label={`Quitar etiqueta ${tag}`} className="hover:text-red-600">
                    <IconX className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
                placeholder="Nueva etiqueta…"
                maxLength={30}
                className="flex-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
              />
              <button onClick={addTag} className="text-sm font-medium text-primary hover:text-primary-dark px-2">Agregar</button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Notas privadas (solo visibles para ti)</p>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ej. contexto de seguimiento, quién lo revisó…"
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5 resize-none"
            />
            <button
              onClick={() => onSaveNotes(feedback.id, notesDraft)}
              disabled={!notesChanged}
              className="mt-1.5 text-sm font-medium text-primary hover:text-primary-dark disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              Guardar notas
            </button>
          </div>
        </div>

      <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 shrink-0">
        <button
          onClick={() => onToggleFavorite(feedback)}
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${feedback.favorite ? 'text-amber-500' : 'text-gray-500 hover:text-amber-500'}`}
        >
          <IconStar className="w-4 h-4" />
          {feedback.favorite ? 'Favorito' : 'Marcar favorito'}
        </button>
        <button
          onClick={() => onRequestDelete(feedback)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 ml-auto"
        >
          <IconTrash className="w-4 h-4" />
          Eliminar
        </button>
      </div>
    </Modal>
  )
}
