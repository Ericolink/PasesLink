import { useState } from 'react'
import { AccessibleModal } from './accessibility/AccessibleModal'
import { DialogFooter } from './DialogFooter'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { useReorderableList } from '../hooks/useReorderableList'
import { EVENT_REMINDER_RULES_MAX } from '../utils/validation'
import { startReconfirmCampaign } from '../firebase/reconfirm'
import type { EventData, ReminderRule } from '../types'

interface Props {
  open: boolean
  eventId: string
  guestTags: EventData['guestTags']
  onClose: () => void
  onStarted: () => void
}

// Modal de un solo uso (no un formulario persistente como
// EditEventForm/ReminderRulesEditor) — se arma su propio mini-editor de
// reglas acá en vez de reutilizar ReminderRulesEditor.tsx tal cual: ese
// componente trae copy y un campo "enabled" propios de RSVP ("confirmar
// RSVP"), que acá se leería confuso. Se reutiliza el hook
// (useReorderableList) que sí es genérico, no el wrapper.
export function StartReconfirmCampaignModal({ open, eventId, guestTags, onClose, onStarted }: Props) {
  const [deadline, setDeadline] = useState('')
  const [excludeTagIds, setExcludeTagIds] = useState<string[]>([])
  const [rules, setRules] = useState<ReminderRule[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const rulesList = useReorderableList<ReminderRule>(rules, setRules, { max: EVENT_REMINDER_RULES_MAX })

  function toggleExcludeTag(tagId: string) {
    setExcludeTagIds((ids) => (ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId]))
  }

  async function handleSubmit() {
    if (!deadline) {
      setError('Elegí una fecha límite.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const deadlineMs = new Date(`${deadline}T23:59:59`).getTime()
      // No hace falta usar el conteo que devuelve la Callable: la
      // suscripción en vivo a `guests` que ya tiene EventDetail va a
      // reflejar los reconfirmStatus nuevos apenas la Cloud Function
      // termine de escribirlos, así que ReconfirmPanel se actualiza solo.
      await startReconfirmCampaign({ eventId, deadline: deadlineMs, excludeTagIds, reminderRules: rules })
      onStarted()
      onClose()
    } catch (err) {
      console.error('Error iniciando campaña de reconfirmación:', err)
      setError('No se pudo iniciar la campaña. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AccessibleModal open={open} onClose={onClose} label="Iniciar reconfirmación">
      <div className="overflow-y-auto px-6 pt-4 pb-2 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Iniciar reconfirmación</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Les pedimos a tus invitados confirmados que <strong>todavía no pagaron</strong> que reconfirmen que van a
            asistir (quien ya pagó nunca tiene que hacerlo). Quien no responda antes del plazo aparece "en riesgo" en
            tu panel — vos decidís si liberar su lugar o darle más tiempo, nunca se libera solo.
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="reconfirm-deadline" className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            Fecha límite para reconfirmar
          </label>
          <input
            id="reconfirm-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>

        {guestTags && guestTags.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Excluir etiqueta</p>
            <div className="flex flex-wrap gap-2">
              {guestTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleExcludeTag(tag.id)}
                  aria-pressed={excludeTagIds.includes(tag.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    excludeTagIds.includes(tag.id)
                      ? 'bg-primary text-white border-primary'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Recordatorios (¿cuántos días antes?)</p>
          {rules.length === 0 && (
            <p className="text-xs text-gray-400">Ej: 3 días antes y 1 día antes del plazo.</p>
          )}
          {rules.map((rule, index) => (
            <div key={rule.id} className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={60}
                value={rule.daysBeforeDeadline}
                onChange={(e) => rulesList.update(rule.id, { daysBeforeDeadline: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
                aria-label={`Días antes, regla ${index + 1}`}
                className="w-20 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">días antes</span>
              <AccessibleButton
                iconOnly
                variant="text"
                onClick={() => rulesList.remove(rule.id)}
                aria-label={`Quitar regla ${index + 1}`}
                className="text-gray-400 hover:text-red-500 shrink-0 text-lg leading-none"
              >
                ×
              </AccessibleButton>
            </div>
          ))}
          {rulesList.canAdd && (
            <button
              type="button"
              onClick={() => rulesList.add({ id: crypto.randomUUID(), daysBeforeDeadline: 1 })}
              className="text-sm text-primary font-medium hover:underline"
            >
              + Agregar recordatorio
            </button>
          )}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}
      </div>

      <DialogFooter>
        <AccessibleButton variant="secondary" onClick={onClose} className="flex-1">
          Cancelar
        </AccessibleButton>
        <AccessibleButton onClick={handleSubmit} disabled={saving} className="flex-1">
          {saving ? 'Iniciando…' : 'Iniciar reconfirmación'}
        </AccessibleButton>
      </DialogFooter>
    </AccessibleModal>
  )
}
