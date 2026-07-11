import { EntryModeSelector } from '../EntryModeSelector'
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods'
import type { EntryMode, PaymentMethod } from '../../../types'

function capacityHint(cap: string): string {
  const n = parseInt(cap)
  if (!n || n <= 0) return ''
  if (n <= 20) return 'Grupo íntimo'
  if (n <= 100) return 'Grupo mediano'
  if (n <= 500) return 'Evento grande'
  return 'Evento masivo'
}

interface StepInvitationMethodProps {
  entryMode: EntryMode
  onEntryModeChange: (mode: EntryMode) => void
  capacity: string
  onCapacityChange: (value: string) => void
  requiresPayment: boolean
  onRequiresPaymentChange: (value: boolean) => void
  paymentMethods: PaymentMethod[]
  onTogglePaymentMethod: (method: PaymentMethod) => void
  ticketPrice: string
  onTicketPriceChange: (value: string) => void
  currency: string
  onCurrencyChange: (value: string) => void
  paymentInstructions: string
  onPaymentInstructionsChange: (value: string) => void
  organizerContactPhone: string
  onOrganizerContactPhoneChange: (value: string) => void
}

export function StepInvitationMethod({
  entryMode,
  onEntryModeChange,
  capacity,
  onCapacityChange,
  requiresPayment,
  onRequiresPaymentChange,
  paymentMethods,
  onTogglePaymentMethod,
  ticketPrice,
  onTicketPriceChange,
  currency,
  onCurrencyChange,
  paymentInstructions,
  onPaymentInstructionsChange,
  organizerContactPhone,
  onOrganizerContactPhoneChange,
}: StepInvitationMethodProps) {
  function adjustCapacity(delta: number) {
    const current = parseInt(capacity) || 0
    const next = Math.max(1, current + delta)
    onCapacityChange(String(next))
  }

  return (
    <>
      <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5 mb-6">
        ⚠️ El tipo de evento no se puede cambiar después de crearlo — elegilo con cuidado.
      </p>

      <EntryModeSelector value={entryMode} onChange={onEntryModeChange} />

      {/* Capacidad */}
      <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Límite de invitados *
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => adjustCapacity(-10)}
            className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors select-none"
            aria-label="Reducir 10"
          >
            −
          </button>
          <input
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => onCapacityChange(e.target.value)}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-center font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => adjustCapacity(10)}
            className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-lg font-semibold hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors select-none"
            aria-label="Aumentar 10"
          >
            +
          </button>
        </div>
        {capacityHint(capacity) && (
          <p className="text-xs text-gray-400 mt-2 text-center">
            {capacityHint(capacity)} · {capacity} personas
          </p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          Es una capacidad recomendada, no un límite estricto: si se supera, los nuevos invitados igual pueden
          registrarse.
        </p>
      </div>

      {/* Cobro de entrada */}
      <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={requiresPayment}
            onChange={(e) => onRequiresPaymentChange(e.target.checked)}
            className="w-4 h-4 text-primary focus:ring-primary rounded"
          />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            ¿Deseas cobrar entrada a los invitados?
          </span>
        </label>
        {requiresPayment && (
          <>
            <p className="text-xs text-gray-500">
              El pago se confirma manualmente: marcás a cada invitado como pagado desde la lista o al escanear su pase.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Métodos de cobro *
              </label>
              <div className="flex gap-2">
                {(['transfer', 'cash'] as PaymentMethod[]).map((m) => (
                  <label
                    key={m}
                    className={`flex-1 flex items-center justify-center gap-2 border rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
                      paymentMethods.includes(m)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={paymentMethods.includes(m)}
                      onChange={() => onTogglePaymentMethod(m)}
                      className="sr-only"
                    />
                    {PAYMENT_METHOD_LABELS[m]}
                  </label>
                ))}
              </div>
              {paymentMethods.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Elegí al menos un método.</p>
              )}
              {paymentMethods.includes('transfer') && (
                <p className="text-xs text-gray-400 mt-1">
                  Transferencia: el lugar se reserva por tiempo limitado hasta confirmar el pago.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label htmlFor="event-ticket-price" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Precio por persona
                </label>
                <input
                  id="event-ticket-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={ticketPrice}
                  onChange={(e) => onTicketPriceChange(e.target.value)}
                  placeholder="Ej: 5000"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label htmlFor="event-currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Moneda
                </label>
                <input
                  id="event-currency"
                  type="text"
                  value={currency}
                  onChange={(e) => onCurrencyChange(e.target.value)}
                  placeholder="$"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {paymentMethods.includes('transfer') && (
              <div>
                <label htmlFor="event-payment-instructions" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Datos para transferencia
                </label>
                <textarea
                  id="event-payment-instructions"
                  value={paymentInstructions}
                  onChange={(e) => onPaymentInstructionsChange(e.target.value)}
                  rows={3}
                  placeholder="Ej: Transferí a alias fiesta.maria.mp, o por Mercado Pago: https://..."
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Los invitados verán esto en su pase junto al monto a pagar.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="event-organizer-contact" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tu WhatsApp para pagos
              </label>
              <input
                id="event-organizer-contact"
                type="tel"
                value={organizerContactPhone}
                onChange={(e) => onOrganizerContactPhoneChange(e.target.value)}
                placeholder="Ej: +52 55 1234 5678"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-gray-400 mt-1">
                Los invitados verán un botón para escribirte por acá: enviar comprobante, resolver dudas o pedir una devolución.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
