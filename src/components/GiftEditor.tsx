import type { GiftInfo } from '../types'
import { AccessibleField } from './accessibility/AccessibleField'

interface Props {
  gifts: GiftInfo | undefined
  onChange: (gifts: GiftInfo | undefined) => void
}

const MESSAGE_MAX = 300
const CASH_INFO_MAX = 300

function isBlank(g: GiftInfo | undefined): boolean {
  return !g?.message?.trim() && !g?.registryUrl?.trim() && !g?.cashInfo?.trim()
}

// 3 campos planos (no una lista, a diferencia de FaqEditor/TransportEditor):
// mensaje libre + link de registro externo + nota de efectivo/transferencia.
// onChange manda undefined cuando los 3 quedan vacíos, para no guardar un
// objeto `gifts: {}` que GiftSection.tsx tendría que volver a chequear.
export function GiftEditor({ gifts, onChange }: Props) {
  function update(patch: Partial<GiftInfo>) {
    const next = { ...gifts, ...patch }
    onChange(isBlank(next) ? undefined : next)
  }

  return (
    <div className="space-y-3">
      <AccessibleField label="Mensaje (opcional)" id="edit-event-gifts-message" helperText="Ej: Tu presencia es nuestro mejor regalo.">
        {(fieldProps) => (
          <input
            {...fieldProps}
            type="text"
            value={gifts?.message ?? ''}
            maxLength={MESSAGE_MAX}
            onChange={(e) => update({ message: e.target.value })}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}
      </AccessibleField>
      <AccessibleField label="Link de mesa de regalos (opcional)" id="edit-event-gifts-registry-url" helperText="Amazon, Liverpool, Mercado Libre...">
        {(fieldProps) => (
          <input
            {...fieldProps}
            type="url"
            value={gifts?.registryUrl ?? ''}
            onChange={(e) => update({ registryUrl: e.target.value })}
            placeholder="https://..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}
      </AccessibleField>
      <AccessibleField label="Datos para regalo en efectivo/transferencia (opcional)" id="edit-event-gifts-cash-info">
        {(fieldProps) => (
          <textarea
            {...fieldProps}
            value={gifts?.cashInfo ?? ''}
            maxLength={CASH_INFO_MAX}
            onChange={(e) => update({ cashInfo: e.target.value })}
            rows={2}
            placeholder="Ej: CLABE 1234567890, a nombre de..."
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          />
        )}
      </AccessibleField>
    </div>
  )
}
