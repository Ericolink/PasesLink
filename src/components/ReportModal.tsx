import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { createReport } from '../firebase/moderation'
import { sendReportNotificationEmail } from '../utils/emailjs'
import { REPORT_REASON_MAX } from '../utils/validation'
import { REPORT_CONTENT_TYPE_LABELS } from '../types'
import type { ReportedContentType } from '../types'
import { IconFlag } from './Icons'
import { Button } from './Button'
import { Modal } from './Modal'
import { DialogHeader } from './DialogHeader'
import { DialogFooter } from './DialogFooter'
import { FormError } from './FormError'

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

  return (
    <Modal open={open} onClose={handleClose} label="Reportar contenido">
      <DialogHeader
        title={`Reportar ${contentType === 'comment' ? 'comentario' : 'foto'}`}
        icon={<IconFlag className="w-4 h-4 text-red-500" />}
        onClose={handleClose}
      />

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
          <Button variant="text" onClick={handleClose} className="mt-2 text-sm">
            Cerrar
          </Button>
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
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-right text-2xs text-gray-400 mt-0.5">{reason.length}/{REPORT_REASON_MAX}</p>
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

            <FormError message={error} />
          </div>

          <DialogFooter padding="compact">
            <Button type="button" variant="secondary" onClick={handleClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={submitting || !reason.trim()} className="flex-1">
              {submitting ? 'Enviando…' : 'Enviar reporte'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Modal>
  )
}
