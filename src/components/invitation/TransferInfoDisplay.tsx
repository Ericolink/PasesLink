import type { EventData } from '../../types'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard'
import { IconCheck, IconCopy } from '../accessibility/AccessibleIcon'

const DEFAULT_CASH_INSTRUCTIONS = 'Pagas en efectivo, presencialmente, el día del evento.'

type EventPaymentInfo = Pick<
  EventData,
  'paymentMethods' | 'transferBankName' | 'transferAccountHolder' | 'transferAccountNumber' | 'transferReference' | 'paymentInstructions' | 'cashInstructions'
>

interface Props {
  event: EventPaymentInfo
  className?: string
}

// Muestra TODOS los métodos que el evento acepta (event.paymentMethods), no
// el que haya quedado grabado en el invitado (guest.paymentMethod puede ser
// null hasta que alguien confirme el pago) — así el invitado ve sus opciones
// libremente en vez de quedar atado a una elección previa. Compartido entre
// el pase (GuestPass/InvitationPass) y la vista previa antes de registrarse
// (EventJoin/WaitlistStatus).
export function TransferInfoDisplay({ event, className }: Props) {
  const { copiedKey, copy } = useCopyToClipboard()
  const showTransfer = event.paymentMethods.includes('transfer')
  const showCash = event.paymentMethods.includes('cash')
  if (!showTransfer && !showCash) return null

  const fields = [
    { key: 'bank', label: 'Banco', value: event.transferBankName?.trim() || '' },
    { key: 'holder', label: 'Titular', value: event.transferAccountHolder?.trim() || '' },
    { key: 'account', label: 'Número de cuenta / CLABE', value: event.transferAccountNumber?.trim() || '' },
    { key: 'reference', label: 'Concepto', value: event.transferReference?.trim() || '' },
  ].filter((f) => f.value)
  const notes = event.paymentInstructions?.trim() || ''
  const showBothHeadings = showTransfer && showCash

  return (
    <div className={className}>
      {showTransfer && (
        <div className={showCash ? 'mb-3' : undefined}>
          {showBothHeadings && (
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--invite-text-muted)]">Transferencia bancaria</p>
          )}
          {fields.length > 0 && (
            <dl className="space-y-1.5">
              {fields.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <dt className="text-xs text-[var(--invite-text-muted)]">{f.label}</dt>
                    <dd className="text-sm font-medium break-words text-[var(--invite-text)]">{f.value}</dd>
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(f.key, f.value)}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium rounded-full border px-2.5 py-1 hover:opacity-80 transition-opacity text-[var(--invite-accent)]"
                    style={{ borderColor: 'var(--invite-accent)' }}
                    aria-label={`Copiar ${f.label}`}
                  >
                    {copiedKey === f.key ? <IconCheck className="w-3.5 h-3.5" /> : <IconCopy className="w-3.5 h-3.5" />}
                    {copiedKey === f.key ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              ))}
            </dl>
          )}
          {notes && (
            <p className={`text-sm whitespace-pre-line text-[var(--invite-text-muted)] ${fields.length > 0 ? 'mt-2' : ''}`}>{notes}</p>
          )}
        </div>
      )}
      {showCash && (
        <div>
          {showBothHeadings && (
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--invite-text-muted)]">Efectivo</p>
          )}
          <p className="text-sm text-[var(--invite-text-muted)]">{event.cashInstructions?.trim() || DEFAULT_CASH_INSTRUCTIONS}</p>
        </div>
      )}
    </div>
  )
}
