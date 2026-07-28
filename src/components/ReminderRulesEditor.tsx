import type { ReminderRule } from '../types'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { Checkbox } from './accessibility/AccessibleField'
import { useReorderableList } from '../hooks/useReorderableList'
import { EVENT_REMINDER_RULES_MAX } from '../utils/validation'

interface Props {
  enabled: boolean
  deadline: string
  rules: ReminderRule[]
  onChangeEnabled: (enabled: boolean) => void
  onChangeDeadline: (deadline: string) => void
  onChangeRules: (rules: ReminderRule[]) => void
}

// El orden de las reglas no importa de cara al invitado (cada una dispara un
// email independiente el día que corresponda) — se usa useReorderableList
// solo por add/remove, moveUp/moveDown quedan sin usar a propósito.
export function ReminderRulesEditor({ enabled, deadline, rules, onChangeEnabled, onChangeDeadline, onChangeRules }: Props) {
  const list = useReorderableList<ReminderRule>(rules, onChangeRules, { max: EVENT_REMINDER_RULES_MAX })

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
        <Checkbox checked={enabled} onChange={(e) => onChangeEnabled(e.target.checked)} />
        Enviar recordatorios automáticos por email a quien no haya confirmado
      </label>

      {enabled && (
        <div className="pl-1 space-y-3">
          <div className="space-y-1">
            <label htmlFor="rsvp-deadline" className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              Fecha límite para confirmar RSVP
            </label>
            <input
              id="rsvp-deadline"
              type="date"
              value={deadline}
              onChange={(e) => onChangeDeadline(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">¿Cuántos días antes enviar?</p>
            {rules.length === 0 && (
              <p className="text-xs text-gray-400">Ej: 7 días antes y 1 día antes del cierre.</p>
            )}
            {rules.map((rule, index) => (
              <div key={rule.id} className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={rule.daysBeforeDeadline}
                  onChange={(e) => list.update(rule.id, { daysBeforeDeadline: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
                  aria-label={`Días antes, regla ${index + 1}`}
                  className="w-20 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">días antes</span>
                <AccessibleButton
                  iconOnly
                  variant="text"
                  onClick={() => list.remove(rule.id)}
                  aria-label={`Quitar regla ${index + 1}`}
                  className="text-gray-400 hover:text-red-500 shrink-0 text-lg leading-none"
                >
                  ×
                </AccessibleButton>
              </div>
            ))}
            {list.canAdd && (
              <button
                type="button"
                onClick={() => list.add({ id: crypto.randomUUID(), daysBeforeDeadline: 1 })}
                className="text-sm text-primary font-medium hover:underline"
              >
                + Agregar regla
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400">
            Los recordatorios se envían una vez al día, cerca de las 8am hora de México, solo a quien todavía no haya confirmado.
          </p>
        </div>
      )}
    </div>
  )
}
