import { useState } from 'react'
import type { PaymentMethod } from '../../../types'
import { PAYMENT_METHOD_LABELS } from '../../../utils/paymentMethods'
import { RadioGroup, RadioGroupOption } from '../../accessibility/AccessibleField'

interface Props {
  paymentMethods: PaymentMethod[]
  bankInstructions: string
  pickupInstructions?: string
  totalLabel: string
  submitting: boolean
  error: string
  onSubmit: (method: PaymentMethod) => void
  onBack: () => void
}

// Flujo independiente al pago de entrada, pero misma filosofía (elegir
// transferencia o efectivo, ver instrucciones, confirmar) — ver RFC §6. Ya
// no pide comprobante/referencia en ningún paso: tanto efectivo como
// transferencia se validan en persona en caja (ver §14-16 del rediseño
// "Ventas del evento") — el invitado nunca sube nada a PaseLink.
export function ConcessionCheckoutView({
  paymentMethods, bankInstructions, pickupInstructions, totalLabel, submitting, error, onSubmit, onBack,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod>(paymentMethods[0])

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--invite-text-muted)]">
        Total a pagar: <span className="font-semibold text-[var(--invite-text)]">{totalLabel}</span>
      </p>

      {paymentMethods.length > 1 && (
        <RadioGroup label="Método de pago">
          <div className="flex gap-2">
            {paymentMethods.map((m) => (
              <RadioGroupOption
                key={m}
                selected={method === m}
                onSelect={() => setMethod(m)}
                className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  method === m
                    ? 'border-[var(--invite-accent)] bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)]'
                    : 'border-[var(--invite-border)] text-[var(--invite-text-muted)]'
                }`}
              >
                {PAYMENT_METHOD_LABELS[m]}
              </RadioGroupOption>
            ))}
          </div>
        </RadioGroup>
      )}

      {method === 'transfer' ? (
        <div className="rounded-lg px-3 py-2.5 text-sm whitespace-pre-line bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)] space-y-1.5">
          <p>{bankInstructions || 'El organizador todavía no cargó los datos para transferencia.'}</p>
          <p className="font-medium">Después de transferir, acude a caja para mostrar tu comprobante y que confirmen tu pago.</p>
        </div>
      ) : (
        <div className="rounded-lg px-3 py-2.5 text-sm whitespace-pre-line bg-[var(--invite-accent-soft)] text-[var(--invite-accent-dark)] space-y-1.5">
          <p>{pickupInstructions || 'Acude a caja para pagar y confirmar tu pedido.'}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onSubmit(method)}
          disabled={submitting}
          className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
        >
          {submitting ? 'Enviando…' : 'Confirmar pedido'}
        </button>
        <button
          onClick={onBack}
          disabled={submitting}
          className="w-full border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
          style={{ borderColor: 'var(--invite-border)' }}
        >
          Volver
        </button>
      </div>
    </div>
  )
}
