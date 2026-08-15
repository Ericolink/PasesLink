import type { CountryCode } from 'libphonenumber-js/min'
import { useAnnouncer } from '../../accessibility/LiveRegion'
import { EntryModeSelector } from '../EntryModeSelector'
import { Checkbox } from '../../accessibility/AccessibleField'
import { PaymentMethodsConfigSection } from '../../PaymentMethodsConfigSection'
import { GUEST_MAX_COMPANIONS } from '../../../utils/validation'
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
  attendeeLimitEnabled: boolean
  onAttendeeLimitEnabledChange: (value: boolean) => void
  maxCompanions: string
  onMaxCompanionsChange: (value: string) => void
  requiresPayment: boolean
  onRequiresPaymentChange: (value: boolean) => void
  paymentMethods: PaymentMethod[]
  onTogglePaymentMethod: (method: PaymentMethod) => void
  ticketPrice: string
  onTicketPriceChange: (value: string) => void
  currency: string
  onCurrencyChange: (value: string) => void
  transferBankName: string
  onTransferBankNameChange: (value: string) => void
  transferAccountHolder: string
  onTransferAccountHolderChange: (value: string) => void
  transferAccountNumber: string
  onTransferAccountNumberChange: (value: string) => void
  transferReference: string
  onTransferReferenceChange: (value: string) => void
  paymentInstructions: string
  onPaymentInstructionsChange: (value: string) => void
  cashInstructions: string
  onCashInstructionsChange: (value: string) => void
  organizerContactPhone: string
  onOrganizerContactPhoneChange: (value: string) => void
  organizerContactPhoneCountry: string
  onOrganizerContactPhoneCountryChange: (value: CountryCode) => void
}

export function StepInvitationMethod({
  entryMode,
  onEntryModeChange,
  capacity,
  onCapacityChange,
  attendeeLimitEnabled,
  onAttendeeLimitEnabledChange,
  maxCompanions,
  onMaxCompanionsChange,
  requiresPayment,
  onRequiresPaymentChange,
  paymentMethods,
  onTogglePaymentMethod,
  ticketPrice,
  onTicketPriceChange,
  currency,
  onCurrencyChange,
  transferBankName,
  onTransferBankNameChange,
  transferAccountHolder,
  onTransferAccountHolderChange,
  transferAccountNumber,
  onTransferAccountNumberChange,
  transferReference,
  onTransferReferenceChange,
  paymentInstructions,
  onPaymentInstructionsChange,
  cashInstructions,
  onCashInstructionsChange,
  organizerContactPhone,
  onOrganizerContactPhoneChange,
  organizerContactPhoneCountry,
  onOrganizerContactPhoneCountryChange,
}: StepInvitationMethodProps) {
  const { announce } = useAnnouncer()

  // Los botones ±10 no mueven el foco al input (a propósito, para poder
  // hacer varios clicks seguidos) — sin este anuncio, un lector de pantalla
  // nunca se entera de que el valor cambió, porque el foco nunca pasa por el
  // campo que sí lo muestra.
  function adjustCapacity(delta: number) {
    const current = parseInt(capacity) || 0
    const next = Math.max(1, current + delta)
    onCapacityChange(String(next))
    announce(`Límite de invitados: ${next}`)
  }

  return (
    <>
      <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2.5 mb-6">
        ⚠️ El tipo de evento no se puede cambiar después de crearlo — elegilo con cuidado.
      </p>

      <EntryModeSelector value={entryMode} onChange={onEntryModeChange} />

      {/* Capacidad */}
      <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <label htmlFor="event-capacity" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Límite de invitados <span aria-hidden="true" className="text-error">*</span>
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
            id="event-capacity"
            type="number"
            required
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
          {attendeeLimitEnabled
            ? 'Al llegar a este número, el autorregistro y las altas manuales se cierran automáticamente.'
            : 'Es una capacidad recomendada, no un límite estricto: si se supera, los nuevos invitados igual pueden registrarse.'}
        </p>
        <label className="flex items-center gap-2.5 cursor-pointer mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <Checkbox checked={attendeeLimitEnabled} onChange={(e) => onAttendeeLimitEnabledChange(e.target.checked)} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Limitar número de asistentes
          </span>
        </label>
      </div>

      {/* Acompañantes por invitado — solo aplica al autoregistro, así que no
          tiene sentido en lista cerrada (sin autoregistro, ver EntryMode). */}
      {entryMode !== 'list' && (
        <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <label htmlFor="event-max-companions" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Acompañantes por invitado (autoregistro)
          </label>
          <input
            id="event-max-companions"
            type="number"
            min="0"
            max={GUEST_MAX_COMPANIONS}
            value={maxCompanions}
            onChange={(e) => onMaxCompanionsChange(e.target.value)}
            className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-center font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-gray-400 mt-2">
            Cuántos acompañantes puede sumar cada invitado que se autoregistre. 0 = no se permiten acompañantes en
            autoregistro.{' '}
            No limita las altas manuales que hagas tú (o tus coanfitriones) desde el panel, ni aplica a "Familia o
            grupo", que tiene su propio límite de integrantes.
          </p>
        </div>
      )}

      {/* Cobro de entrada */}
      <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <PaymentMethodsConfigSection
          requiresPayment={requiresPayment}
          onRequiresPaymentChange={onRequiresPaymentChange}
          paymentMethods={paymentMethods}
          onTogglePaymentMethod={onTogglePaymentMethod}
          ticketPrice={ticketPrice}
          onTicketPriceChange={onTicketPriceChange}
          currency={currency}
          onCurrencyChange={onCurrencyChange}
          transferBankName={transferBankName}
          onTransferBankNameChange={onTransferBankNameChange}
          transferAccountHolder={transferAccountHolder}
          onTransferAccountHolderChange={onTransferAccountHolderChange}
          transferAccountNumber={transferAccountNumber}
          onTransferAccountNumberChange={onTransferAccountNumberChange}
          transferReference={transferReference}
          onTransferReferenceChange={onTransferReferenceChange}
          paymentInstructions={paymentInstructions}
          onPaymentInstructionsChange={onPaymentInstructionsChange}
          cashInstructions={cashInstructions}
          onCashInstructionsChange={onCashInstructionsChange}
          organizerContactPhone={organizerContactPhone}
          onOrganizerContactPhoneChange={onOrganizerContactPhoneChange}
          organizerContactPhoneCountry={organizerContactPhoneCountry}
          onOrganizerContactPhoneCountryChange={onOrganizerContactPhoneCountryChange}
          idPrefix="event"
          showPriceError
          dark
        />
      </div>
    </>
  )
}
