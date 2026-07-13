import { useEffect, useState } from 'react'
import { useModalA11y } from '../../hooks/useModalA11y'
import { getReportCountForContent, getReportsAboutUser, saveReportNotes } from '../../firebase/moderation'
import { applySanction, getUserSanctionHistory, getUserSanctionSummary, PERMANENT_SANCTION_MS, revokeSanction } from '../../firebase/sanctions'
import type {
  ContentReport,
  ReportStatus,
  SanctionHistoryEntry,
  SanctionScope,
  SanctionType,
  UserSanctionSummary,
} from '../../types'
import { REPORT_CONTENT_TYPE_LABELS, REPORT_STATUS_LABELS, SANCTION_TYPE_LABELS } from '../../types'
import { optimizedImageUrl } from '../../utils/cloudinary'
import { IconBan, IconFlag, IconShield, IconTrash, IconX } from '../Icons'

const STATUS_ORDER: ReportStatus[] = ['pending', 'in_review', 'resolved', 'rejected']
const SANCTION_TYPES: SanctionType[] = ['warning', 'comment_restriction', 'photo_restriction', 'suspension', 'ban']

const DURATION_PRESETS: { label: string; ms: number | null }[] = [
  { label: '1 hora', ms: 60 * 60 * 1000 },
  { label: '24 horas', ms: 24 * 60 * 60 * 1000 },
  { label: '3 días', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 días', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 días', ms: 30 * 24 * 60 * 60 * 1000 },
  { label: 'Permanente', ms: null },
]

interface Props {
  report: ContentReport | null
  admin: { adminUid: string; adminEmail: string | null }
  onClose: () => void
  onStatusChange: (id: string, status: ReportStatus) => void
  onDeleteContent: (report: ContentReport) => void
}

export function AdminReportDetail({ report, admin, onClose, onStatusChange, onDeleteContent }: Props) {
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [contentReportCount, setContentReportCount] = useState<number | null>(null)
  const [userReports, setUserReports] = useState<ContentReport[]>([])
  const [sanctionHistory, setSanctionHistory] = useState<SanctionHistoryEntry[]>([])
  const [sanctionSummary, setSanctionSummary] = useState<UserSanctionSummary | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [sanctionType, setSanctionType] = useState<SanctionType>('warning')
  const [sanctionScope, setSanctionScope] = useState<SanctionScope>('global')
  const [durationMs, setDurationMs] = useState<number | null>(DURATION_PRESETS[1].ms)
  const [sanctionReason, setSanctionReason] = useState('')
  const [applyingSanction, setApplyingSanction] = useState(false)
  const [sanctionError, setSanctionError] = useState('')
  const [sanctionMessage, setSanctionMessage] = useState('')

  const dialogRef = useModalA11y<HTMLDivElement>(!!report, onClose)

  // Sincroniza los borradores/contexto solo cuando cambia EL reporte mostrado
  // (por id), no en cada render — mismo criterio que AdminFeedbackDetail.tsx.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    setNotesDraft(report?.adminNotes || '')
    setSanctionReason(report?.reason || '')
    setContentReportCount(null)
    setUserReports([])
    setSanctionHistory([])
    setSanctionSummary(null)
    setShowHistory(false)
    setSanctionError('')
    setSanctionMessage('')
    if (!report) return

    let cancelled = false
    setLoadingContext(true)
    Promise.all([
      getReportCountForContent(report.contentId),
      report.contentAuthorUid ? getUserSanctionSummary(report.contentAuthorUid) : Promise.resolve(null),
    ])
      .then(([count, summary]) => {
        if (cancelled) return
        setContentReportCount(count)
        setSanctionSummary(summary)
      })
      .catch((err) => console.error('Error cargando el contexto del reporte:', err))
      .finally(() => { if (!cancelled) setLoadingContext(false) })

    return () => { cancelled = true }
  }, [report?.id])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  if (!report) return null

  function loadUserHistory() {
    if (!report?.contentAuthorUid) return
    setShowHistory(true)
    getReportsAboutUser(report.contentAuthorUid).then(setUserReports).catch((err) => console.error('Error cargando reportes del usuario:', err))
    getUserSanctionHistory(report.contentAuthorUid).then(setSanctionHistory).catch((err) => console.error('Error cargando historial de sanciones:', err))
  }

  async function handleSaveNotes() {
    if (!report) return
    setSavingNotes(true)
    try {
      await saveReportNotes(report.id, notesDraft, admin)
    } catch (err) {
      console.error('Error guardando notas del reporte:', err)
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleApplySanction() {
    if (!report?.contentAuthorUid || applyingSanction) return
    setApplyingSanction(true)
    setSanctionError('')
    setSanctionMessage('')
    try {
      await applySanction({
        targetUid: report.contentAuthorUid,
        type: sanctionType,
        scope: sanctionScope,
        eventId: sanctionScope === 'event' ? report.eventId : undefined,
        eventName: sanctionScope === 'event' ? report.eventName : undefined,
        durationMs: sanctionType === 'warning' ? null : durationMs,
        reason: sanctionReason.trim() || report.reason,
        adminUid: admin.adminUid,
        adminEmail: admin.adminEmail,
        reportId: report.id,
      })
      const summary = await getUserSanctionSummary(report.contentAuthorUid)
      setSanctionSummary(summary)
      setSanctionMessage('Sanción aplicada correctamente.')
      if (showHistory) loadUserHistory()
    } catch (err) {
      setSanctionError(err instanceof Error ? err.message : 'No se pudo aplicar la sanción.')
    } finally {
      setApplyingSanction(false)
    }
  }

  async function handleRevoke(type: Exclude<SanctionType, 'warning'>, scope: SanctionScope, eventId?: string, eventName?: string) {
    if (!report?.contentAuthorUid) return
    setSanctionError('')
    try {
      await revokeSanction({
        targetUid: report.contentAuthorUid,
        type,
        scope,
        eventId,
        eventName,
        adminUid: admin.adminUid,
        adminEmail: admin.adminEmail,
        reportId: report.id,
      })
      const summary = await getUserSanctionSummary(report.contentAuthorUid)
      setSanctionSummary(summary)
      if (showHistory) loadUserHistory()
    } catch (err) {
      setSanctionError(err instanceof Error ? err.message : 'No se pudo revertir la sanción.')
    }
  }

  const activeRestrictions = sanctionSummary ? collectActiveRestrictions(sanctionSummary) : []

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Reporte de ${REPORT_CONTENT_TYPE_LABELS[report.contentType]}`}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-bounce-in"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              <IconFlag className="w-4 h-4" />
              {REPORT_CONTENT_TYPE_LABELS[report.contentType]} reportado en "{report.eventName}"
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white break-words">{report.reason}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            <span>Reportado por: {report.anonymous ? 'Anónimo' : (report.reporterName || report.reporterEmail || 'Usuario')}</span>
            <span>{new Date(report.createdAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span>
              {contentReportCount === null ? 'Contando reportes…' : `${contentReportCount} reporte${contentReportCount === 1 ? '' : 's'} sobre este contenido`}
            </span>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Contenido original — autor: {report.contentAuthorName || 'desconocido'}
              {report.contentAuthorUid ? ' (cuenta registrada)' : ' (invitado sin cuenta)'}
            </p>
            {report.contentType === 'photo' ? (
              // max-w-full: sin ancho definido, una foto reportada muy ancha
              // (panorámica, o simplemente de alta resolución) desbordaba el
              // modal y forzaba scroll horizontal — object-contain (en vez de
              // cover, que solo tiene sentido con una caja w×h fija) escala
              // manteniendo proporción dentro de ambos límites.
              <img
                src={optimizedImageUrl(report.contentSnapshot, 500)}
                alt={report.contentCaption || 'Foto reportada'}
                className="max-h-64 max-w-full rounded-lg object-contain"
              />
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                {report.contentSnapshot}
              </p>
            )}
            {report.contentCaption && (
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1.5">{report.contentCaption}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Estado del reporte</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => onStatusChange(report.id, s)}
                  className={`min-h-11 inline-flex items-center text-xs px-4 rounded-full font-medium border transition-colors ${
                    report.status === s
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {REPORT_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              onClick={() => onDeleteContent(report)}
              className="min-h-11 -mx-2 px-2 inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
            >
              <IconTrash className="w-4 h-4" />
              Eliminar {report.contentType === 'comment' ? 'comentario' : 'foto'} reportada
            </button>
          </div>

          {/* Sanciones — solo si el contenido pertenece a una cuenta registrada */}
          {report.contentAuthorUid && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <IconShield className="w-4 h-4" />
                Moderar cuenta
              </p>

              {activeRestrictions.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Sanciones activas</p>
                  {activeRestrictions.map((r) => (
                    <div key={`${r.type}-${r.scope}-${r.eventId || 'global'}`} className="flex items-center justify-between gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-1.5">
                      <span className="text-amber-800 dark:text-amber-300">
                        {SANCTION_TYPE_LABELS[r.type]} · {r.scope === 'global' ? 'toda la app' : report.eventName} · {r.until >= PERMANENT_SANCTION_MS ? 'permanente' : `hasta ${new Date(r.until).toLocaleDateString('es-MX')}`}
                      </span>
                      <button
                        onClick={() => handleRevoke(r.type, r.scope, r.scope === 'event' ? report.eventId : undefined, r.scope === 'event' ? report.eventName : undefined)}
                        className="min-h-11 px-2 -my-2 inline-flex items-center text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 font-medium shrink-0"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Tipo de sanción
                  <select
                    value={sanctionType}
                    onChange={(e) => setSanctionType(e.target.value as SanctionType)}
                    className="mt-1 w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
                  >
                    {SANCTION_TYPES.map((t) => (
                      <option key={t} value={t}>{SANCTION_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                {sanctionType !== 'warning' && (
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Duración
                    <select
                      value={String(durationMs)}
                      onChange={(e) => setDurationMs(e.target.value === 'null' ? null : Number(e.target.value))}
                      className="mt-1 w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
                    >
                      {DURATION_PRESETS.map((p) => (
                        <option key={p.label} value={String(p.ms)}>{p.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {sanctionType !== 'warning' && (
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="radio" checked={sanctionScope === 'global'} onChange={() => setSanctionScope('global')} className="accent-primary" />
                    Bloquear toda la app
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="radio" checked={sanctionScope === 'event'} onChange={() => setSanctionScope('event')} className="accent-primary" />
                    Solo este evento
                  </label>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Motivo</label>
                <textarea
                  value={sanctionReason}
                  onChange={(e) => setSanctionReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5 resize-none"
                />
              </div>

              {sanctionError && <p className="text-xs text-red-500">{sanctionError}</p>}
              {sanctionMessage && <p className="text-xs text-green-600 dark:text-green-400">{sanctionMessage}</p>}

              <button
                onClick={handleApplySanction}
                disabled={applyingSanction}
                className="min-h-11 inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-4 disabled:opacity-50"
              >
                <IconBan className="w-4 h-4" />
                {applyingSanction ? 'Aplicando…' : 'Aplicar sanción'}
              </button>

              {!showHistory ? (
                <button onClick={loadUserHistory} className="block text-xs font-medium text-primary hover:text-primary-dark">
                  Ver historial de este usuario
                </button>
              ) : (
                <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {userReports.length} reporte{userReports.length === 1 ? '' : 's'} recibido{userReports.length === 1 ? '' : 's'} en total
                  </p>
                  {sanctionHistory.length > 0 && (
                    <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 max-h-32 overflow-y-auto">
                      {sanctionHistory.map((h) => (
                        <li key={h.id}>
                          {new Date(h.createdAt).toLocaleDateString('es-MX')} — {h.type === 'revoked' ? h.reason : `${SANCTION_TYPE_LABELS[h.type]}${h.reason ? `: ${h.reason}` : ''}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {loadingContext && <p className="text-xs text-gray-400">Cargando contexto…</p>}

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Notas internas (solo visibles para admins)</p>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={2}
              maxLength={1000}
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5 resize-none"
            />
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes || notesDraft === report.adminNotes}
              className="mt-1.5 text-sm font-medium text-primary hover:text-primary-dark disabled:text-gray-300 disabled:cursor-not-allowed"
            >
              {savingNotes ? 'Guardando…' : 'Guardar notas'}
            </button>
          </div>

          {report.actionHistory.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Historial de acciones</p>
              <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                {[...report.actionHistory].reverse().map((a) => (
                  <li key={a.id}>
                    {new Date(a.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} — {a.detail} {a.adminEmail ? `(${a.adminEmail})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// bannedUntil sirve tanto para 'ban' como 'suspension' (ver FIELD_BY_TYPE en
// sanctions.ts) — al leer el resumen no sabemos cuál de los dos se aplicó
// originalmente, así que se infiere por la fecha: sin vencimiento real
// (PERMANENT_SANCTION_MS) se muestra como baneo, si no como suspensión.
function collectActiveRestrictions(summary: UserSanctionSummary) {
  const now = Date.now()
  const fields: { field: 'bannedUntil' | 'commentBanUntil' | 'photoBanUntil'; type: (until: number) => Exclude<SanctionType, 'warning'> }[] = [
    { field: 'bannedUntil', type: (until) => (until >= PERMANENT_SANCTION_MS ? 'ban' : 'suspension') },
    { field: 'commentBanUntil', type: () => 'comment_restriction' },
    { field: 'photoBanUntil', type: () => 'photo_restriction' },
  ]
  const result: { type: Exclude<SanctionType, 'warning'>; scope: SanctionScope; eventId?: string; until: number }[] = []
  for (const { field, type } of fields) {
    if (summary.global[field] > now) {
      result.push({ type: type(summary.global[field]), scope: 'global', until: summary.global[field] })
    }
    for (const [eventId, scope] of Object.entries(summary.events)) {
      if (scope[field] > now) {
        result.push({ type: type(scope[field]), scope: 'event', eventId, until: scope[field] })
      }
    }
  }
  return result
}
