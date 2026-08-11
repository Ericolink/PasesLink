import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { createReport } from '../firebase/moderation'
import { REPORT_REASON_MAX } from '../utils/validation'
import type { ReportedContentType } from '../types'
import { IconFlag } from './accessibility/AccessibleIcon'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { AccessibleModal } from './accessibility/AccessibleModal'
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

// AccessibleModal de reporte, compartido por comentarios y fotos del muro (ver
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

  // Auditoría de escalabilidad (F15): ReportButton ahora desmonta este
  // componente al cerrar (en vez de dejarlo montado y oculto) — ya no hace
  // falta resetear el formulario a mano, una instancia nueva la próxima vez
  // que se abra ya arranca de useState limpio.
  function handleClose() {
    if (submitting) return
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !reason.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const reporterName = profile?.displayName || user.displayName || user.email || 'Usuario'
      // El aviso al admin ya no se dispara desde acá — la creación de este
      // documento es lo que dispara el trigger de Firestore onReportCreated
      // (functions/src/triggers/onReportCreated.ts), ver
      // NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 4.
      await createReport({
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el reporte. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AccessibleModal open={open} onClose={handleClose} label="Reportar contenido">
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
          <AccessibleButton variant="text" onClick={handleClose} className="mt-2 text-sm">
            Cerrar
          </AccessibleButton>
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
              <label htmlFor="report-reason" className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">
                ¿Por qué quieres reportar este contenido? <span className="text-red-500">*</span>
              </label>
              <textarea
                id="report-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
                maxLength={REPORT_REASON_MAX}
                // Abre en respuesta directa a que el usuario tocó "Reportar"
                // (nunca al cargar la página) — ver el comentario de arriba
                // sobre por qué el formulario tiene scroll propio.
                // eslint-disable-next-line jsx-a11y/no-autofocus
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
            <AccessibleButton type="button" variant="secondary" onClick={handleClose} className="flex-1">
              Cancelar
            </AccessibleButton>
            <AccessibleButton type="submit" variant="danger" disabled={submitting || !reason.trim()} className="flex-1">
              {submitting ? 'Enviando…' : 'Enviar reporte'}
            </AccessibleButton>
          </DialogFooter>
        </form>
      )}
    </AccessibleModal>
  )
}
