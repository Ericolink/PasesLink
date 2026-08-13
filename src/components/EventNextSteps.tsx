import type { EventData, GuestData } from '../types'

interface Step {
  id: string
  text: string
  ctaLabel: string
  onClick: () => void
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

interface Props {
  event: EventData
  guests: GuestData[]
  totalPeople: number
  coOrganizersCount: number
  canAddGuests: boolean
  canManageCoOrganizers: boolean
  onOpenCoOrganizers: () => void
}

// Rediseño del Dashboard del Evento: responde directo a "¿qué necesito hacer
// ahora?" en vez de que el organizador tenga que escanear el resto de las
// cards para deducirlo. Reglas simples, sin persistencia — se recalculan en
// cada render a partir de datos que la pantalla ya tiene cargados. `guests`
// puede venir acotado en eventos grandes (ver useEvent/GUEST_WINDOW_DEFAULT)
// — mismo criterio ya aceptado en el resto de esta pantalla (búsqueda/
// filtros también parten de esa ventana salvo que se pida el resto explícitamente).
// Se oculta sola (return null) si no hay ninguna tarea pendiente, mismo
// criterio de "no molestar a quien no lo necesita" que el resto de la página.
export function EventNextSteps({
  event,
  guests,
  totalPeople,
  coOrganizersCount,
  canAddGuests,
  canManageCoOrganizers,
  onOpenCoOrganizers,
}: Props) {
  const steps: Step[] = []

  if (canAddGuests && event.guestCount === 0) {
    steps.push({
      id: 'no-guests',
      text: 'Todavía no agregaste invitados.',
      ctaLabel: 'Agregar invitados',
      onClick: () => scrollToId('add-guests'),
    })
  }

  if (event.requiresPayment && canAddGuests) {
    const pendingPayments = guests.filter((g) => g.paymentStatus === 'pending_confirmation').length
    if (pendingPayments > 0) {
      steps.push({
        id: 'pending-payments',
        text: `Tienes ${pendingPayments} pago${pendingPayments === 1 ? '' : 's'} por confirmar.`,
        ctaLabel: 'Ver invitados',
        onClick: () => scrollToId('add-guests'),
      })
    }
  }

  if (event.attendeeLimitEnabled && event.capacity > 0 && totalPeople >= event.capacity) {
    steps.push({
      id: 'full',
      text: 'Tu evento está lleno.',
      ctaLabel: 'Ver lista de espera',
      onClick: () => scrollToId('waitlist'),
    })
  }

  if (canManageCoOrganizers && coOrganizersCount === 0) {
    steps.push({
      id: 'no-coorganizers',
      text: '¿Alguien más te ayuda a organizar? Invítalo como colaborador.',
      ctaLabel: 'Invitar',
      onClick: onOpenCoOrganizers,
    })
  }

  if (steps.length === 0) return null

  return (
    <div
      className="border border-primary/20 dark:border-primary/30 rounded-xl bg-primary/5 dark:bg-primary/10 p-4 mb-5"
      role="region"
      aria-label="Qué sigue"
    >
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
        Qué sigue
      </h2>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 rounded-lg px-3 py-2.5"
          >
            <span className="text-sm text-gray-700 dark:text-gray-300">{step.text}</span>
            <button
              type="button"
              onClick={step.onClick}
              className="shrink-0 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
            >
              {step.ctaLabel}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
