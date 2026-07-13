import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { useModalA11y } from '../hooks/useModalA11y'
import { createReport } from '../firebase/moderation'
import { sendReportNotificationEmail } from '../utils/emailjs'
import { REPORT_REASON_MAX } from '../utils/validation'
import { REPORT_CONTENT_TYPE_LABELS } from '../types'
import type { ReportedContentType } from '../types'
import { IconFlag, IconX } from './Icons'

interface Props {
  open: boolean
  onClose: () => void
  eventId: string
  eventName: string
  contentType: ReportedContentType
  contentId: string
  contentSnapshot: string
  contentCaption?: string
  contentAuthorName: string
  contentAuthorToken: string
}

// Modal de reporte, compartido por comentarios y fotos del muro (ver
// ReportButton). Requiere sesión iniciada — si no hay usuario, se muestra un
// aviso con link a /login en vez del formulario, para no dejar el botón
// "Reportar" como un callejón sin salida silencioso.
export function ReportModal({
  open,
  onClose,
  eventId,
  eventName,
  contentType,
  contentId,
  contentSnapshot,
  contentCaption,
  contentAuthorName,
  contentAuthorToken,
}: Props) {
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const [reason, setReason] = useState('')
  const [anonymous, setAnonymous] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const dialogRef = useModalA11y<HTMLDivElement>(open, handleClose)

  function handleClose() {
    if (submitting) return
    onClose()
    // Reset diferido (no en el mismo tick del cierre) para que el usuario no
    // vea el formulario "vaciarse" durante la animación de salida.
    setTimeout(() => {
      setReason('')
      setAnonymous(true)
      setError('')
      setDone(false)
    }, 200)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !reason.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const reporterName = profile?.displayName || user.displayName || user.email || 'Usuario'
      const reportId = await createReport({
        eventId,
        eventName,
        contentType,
        contentId,
        contentSnapshot,
        contentCaption,
        contentAuthorName,
        contentAuthorToken,
        reporterUid: user.uid,
        reporterName,
        reporterEmail: user.email,
        anonymous,
        reason,
      })
      setDone(true)
      sendReportNotificationEmail({
        eventName,
        reportedUser: contentAuthorName,
        reporter: anonymous ? 'Anónimo' : reporterName,
        contentTypeLabel: REPORT_CONTENT_TYPE_LABELS[contentType],
        reason,
        reportId,
      }).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el reporte. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Reportar contenido"
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm max-h-[85dvh] flex flex-col animate-bounce-in"
      >
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <IconFlag className="w-4 h-4 text-red-500" />
            Reportar {contentType === 'comment' ? 'comentario' : 'foto'}
          </h2>
          <button
            onClick={handleClose}
            aria-label="Cerrar"
            className="-m-2 min-w-11 min-h-11 inline-flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {!user ? (
          <div className="px-6 py-6 text-center space-y-3 overflow-y-auto">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Necesitas iniciar sesión para reportar contenido.
            </p>
            <Link
              to="/login"
              className="inline-block bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        ) : done ? (
          <div className="px-6 py-8 text-center space-y-2 overflow-y-auto animate-fade-in">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <IconFlag className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">¡Gracias! Tu reporte fue recibido.</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Nuestro equipo lo va a revisar lo antes posible.</p>
            <button
              onClick={handleClose}
              className="mt-2 text-sm font-medium text-primary hover:text-primary-dark"
            >
              Cerrar
            </button>
          </div>
        ) : (
          // Formulario partido en región scrolleable (textarea/radios) +
          // botones shrink-0 siempre visibles — antes el modal no tenía
          // max-height ni scroll propio, así que con el teclado abierto
          // (autoFocus dispara el teclado apenas se abre) los botones
          // podían quedar fuera de la pantalla sin forma de llegar a ellos.
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 py-4 space-y-4 overflow-y-auto">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                  ¿Por qué quieres reportar este contenido? <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  required
                  maxLength={REPORT_REASON_MAX}
                  autoFocus
                  placeholder="Describe brevemente el problema…"
                  className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <p className="text-right text-[11px] text-gray-400 mt-0.5">{reason.length}/{REPORT_REASON_MAX}</p>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="radio" name="anon" checked={anonymous} onChange={() => setAnonymous(true)} className="accent-primary" />
                  Reportar de forma anónima
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="radio" name="anon" checked={!anonymous} onChange={() => setAnonymous(false)} className="accent-primary" />
                  Reportar con mi nombre de usuario
                </label>
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
            </div>

            <div className="shrink-0 flex gap-3 px-6 pt-1 pb-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !reason.trim()}
                className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-40"
              >
                {submitting ? 'Enviando…' : 'Enviar reporte'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
