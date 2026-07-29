import type { EventData, GuestData } from '../../../types'
import { IconUtensils } from '../../accessibility/AccessibleIcon'
import { EventInfoSection } from '../EventInfoSection'

interface Props {
  event: EventData
  guest: GuestData
}

// Solo lectura: catálogo de opciones/restricciones disponibles + la
// selección propia del invitado si ya la hizo. El picker interactivo real
// sigue viviendo en GuestEditModal (botón "Editar mis datos" en la tarjeta
// boarding-pass, sin tocar) — este módulo no duplica ese flujo de escritura.
export function MenuSection({ event, guest }: Props) {
  const options = event.menu?.options ?? []
  const restrictions = event.menu?.restrictions ?? []
  if (options.length === 0 && restrictions.length === 0) return null

  const selectedOption = options.find((o) => o.id === guest.menuSelection?.optionId)
  const selectedRestrictions = restrictions.filter((r) => guest.menuSelection?.restrictionIds?.includes(r.id))

  return (
    <EventInfoSection id="menu" icon={<IconUtensils className="w-4 h-4" />} title="Menú y restricciones">
      <div className="space-y-3">
        {guest.menuSelection && (selectedOption || selectedRestrictions.length > 0) && (
          <div className="rounded-lg px-3 py-2.5 bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]">
            <p className="text-xs font-semibold uppercase tracking-wide mb-0.5">Tu selección</p>
            {selectedOption && <p className="text-sm">{selectedOption.name}</p>}
            {selectedRestrictions.length > 0 && (
              <p className="text-sm">{selectedRestrictions.map((r) => r.label).join(', ')}</p>
            )}
            {guest.menuSelection.note && <p className="text-xs mt-1 italic">{guest.menuSelection.note}</p>}
          </div>
        )}

        {options.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1 text-[var(--invite-text-muted)]">Opciones disponibles</p>
            <ul className="space-y-1">
              {options.map((opt) => (
                <li key={opt.id} className="text-sm">
                  <span className="font-medium">{opt.name}</span>
                  {opt.description && <span className="text-[var(--invite-text-muted)]"> — {opt.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {restrictions.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1 text-[var(--invite-text-muted)]">Restricciones alimenticias</p>
            <p className="text-sm text-[var(--invite-text-muted)]">{restrictions.map((r) => r.label).join(', ')}</p>
          </div>
        )}
      </div>
    </EventInfoSection>
  )
}
