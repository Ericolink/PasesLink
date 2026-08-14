import type { CountryCode } from 'libphonenumber-js/min'
import { AccessibleField, Checkbox, FieldError } from './accessibility/AccessibleField'
import { CountryCodeSelect } from './CountryCodeSelect'
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods'
import { sanitizeDecimalInput } from '../utils/validationRules'
import type { PaymentMethod } from '../types'

interface PaymentMethodsConfigSectionProps {
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
  /** Ids de campo únicos por instancia — StepInvitationMethod y EditEventForm usan prefijos distintos (histórico, ver sus tests de accesibilidad por id). */
  idPrefix: string
  /** Precio inválido en el paso de creación bloquea avanzar; en edición no hace falta este aviso redundante con el submit guard. */
  showPriceError?: boolean
  /** true = layout del wizard de creación (fondo oscuro soportado); false = layout de EditEventForm (siempre claro). Ambos ya se comportaban distinto antes de unificar este bloque. */
  dark?: boolean
}

const inputClass = (dark: boolean | undefined) =>
  `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
    dark ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white' : 'border-gray-300'
  }`

// Bloque de configuración de métodos de pago del evento — compartido entre
// creación (StepInvitationMethod) y edición (EditEventForm), que hasta acá
// mantenían dos copias independientes de este mismo formulario. Controlado
// por completo: ninguno de los dos dueños del `form` necesita mover su
// estado, solo pasar los campos nuevos (transferBankName/AccountHolder/
// AccountNumber/Reference, cashInstructions) junto con los de siempre.
export function PaymentMethodsConfigSection({
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
  idPrefix,
  showPriceError = false,
  dark = false,
}: PaymentMethodsConfigSectionProps) {
  const cls = inputClass(dark)
  const labelCls = `block text-sm font-medium mb-1.5 ${dark ? 'text-gray-700 dark:text-gray-300' : 'text-gray-700'}`

  return (
    <>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <Checkbox checked={requiresPayment} onChange={(e) => onRequiresPaymentChange(e.target.checked)} />
        <span className={`text-sm font-semibold uppercase tracking-wide ${dark ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500'}`}>
          {dark ? '¿Deseas cobrar entrada a los invitados?' : 'Cobrar entrada a los invitados'}
        </span>
      </label>
      {requiresPayment && (
        <>
          {dark && (
            <p className="text-xs text-gray-500">
              El pago se confirma manualmente: marcas a cada invitado como pagado desde la lista o al escanear su pase.
            </p>
          )}

          <fieldset className="border-0 p-0 m-0">
            <legend className={labelCls}>
              ¿Cómo podrán pagar tus invitados? <span aria-hidden="true" className="text-error">*</span>
            </legend>
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
            {paymentMethods.length === 0 && <FieldError message="Elige al menos un método." />}
          </fieldset>

          <div className="grid grid-cols-3 gap-3">
            <AccessibleField
              label="Precio por persona"
              id={`${idPrefix}-ticket-price`}
              className="col-span-2"
              error={showPriceError && !(parseFloat(ticketPrice) > 0) ? 'Ingresa un precio mayor a 0.' : null}
            >
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  type="number"
                  min="0"
                  step="0.01"
                  value={ticketPrice}
                  onChange={(e) => onTicketPriceChange(sanitizeDecimalInput(e.target.value))}
                  placeholder="Ej: 5000"
                  className={cls}
                />
              )}
            </AccessibleField>
            <AccessibleField label="Moneda" id={`${idPrefix}-currency`}>
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  type="text"
                  value={currency}
                  onChange={(e) => onCurrencyChange(e.target.value)}
                  placeholder="$"
                  className={cls}
                />
              )}
            </AccessibleField>
          </div>

          {paymentMethods.includes('transfer') && (
            <div className="space-y-3 border-t pt-3 border-gray-100 dark:border-gray-700">
              <p className={labelCls}>Información de transferencia</p>
              <div className="grid grid-cols-2 gap-3">
                <AccessibleField label="Banco" id={`${idPrefix}-transfer-bank`}>
                  {(fieldProps) => (
                    <input
                      {...fieldProps}
                      type="text"
                      value={transferBankName}
                      onChange={(e) => onTransferBankNameChange(e.target.value)}
                      placeholder="Ej: BBVA"
                      className={cls}
                    />
                  )}
                </AccessibleField>
                <AccessibleField label="Titular" id={`${idPrefix}-transfer-holder`}>
                  {(fieldProps) => (
                    <input
                      {...fieldProps}
                      type="text"
                      value={transferAccountHolder}
                      onChange={(e) => onTransferAccountHolderChange(e.target.value)}
                      placeholder="Ej: María Pérez"
                      className={cls}
                    />
                  )}
                </AccessibleField>
              </div>
              <AccessibleField label="Número de cuenta / CLABE" id={`${idPrefix}-transfer-account`}>
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    type="text"
                    value={transferAccountNumber}
                    onChange={(e) => onTransferAccountNumberChange(e.target.value)}
                    placeholder="Ej: 012180001234567895"
                    className={cls}
                  />
                )}
              </AccessibleField>
              <AccessibleField label="Concepto sugerido" id={`${idPrefix}-transfer-reference`}>
                {(fieldProps) => (
                  <input
                    {...fieldProps}
                    type="text"
                    value={transferReference}
                    onChange={(e) => onTransferReferenceChange(e.target.value)}
                    placeholder="Ej: Nombre + evento"
                    className={cls}
                  />
                )}
              </AccessibleField>
              <AccessibleField
                label="Notas adicionales (opcional)"
                id={`${idPrefix}-payment-instructions`}
                helperText="Cualquier otro dato que no entre arriba — alias, link de Mercado Pago, etc. Los invitados lo verán junto a los datos de transferencia."
              >
                {(fieldProps) => (
                  <textarea
                    {...fieldProps}
                    value={paymentInstructions}
                    onChange={(e) => onPaymentInstructionsChange(e.target.value)}
                    rows={2}
                    placeholder="Ej: También puedes pagar por Mercado Pago: https://..."
                    className={cls}
                  />
                )}
              </AccessibleField>
            </div>
          )}

          {paymentMethods.includes('cash') && (
            <div className="space-y-1.5 border-t pt-3 border-gray-100 dark:border-gray-700">
              <AccessibleField
                label="Mensaje para pago en efectivo"
                id={`${idPrefix}-cash-instructions`}
                helperText="Si lo dejas vacío, los invitados verán el mensaje por default."
              >
                {(fieldProps) => (
                  <textarea
                    {...fieldProps}
                    value={cashInstructions}
                    onChange={(e) => onCashInstructionsChange(e.target.value)}
                    rows={2}
                    placeholder="Pagas en efectivo, presencialmente, el día del evento."
                    className={cls}
                  />
                )}
              </AccessibleField>
            </div>
          )}

          <AccessibleField
            label="Tu WhatsApp para pagos"
            id={`${idPrefix}-organizer-contact`}
            helperText="Los invitados verán un botón para escribirte por acá: enviar comprobante, resolver dudas o pedir una devolución."
          >
            {(fieldProps) => (
              <div className="flex items-center gap-1.5">
                <CountryCodeSelect
                  value={organizerContactPhoneCountry as CountryCode}
                  onChange={onOrganizerContactPhoneCountryChange}
                  aria-label="País del WhatsApp de contacto"
                  className={dark
                    ? 'border border-gray-300 dark:border-gray-600 rounded-lg px-1.5 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary'
                    : 'border border-gray-300 rounded-lg px-1.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'}
                />
                <input
                  {...fieldProps}
                  type="tel"
                  value={organizerContactPhone}
                  onChange={(e) => onOrganizerContactPhoneChange(e.target.value)}
                  placeholder="Ej: 55 1234 5678"
                  className={`flex-1 min-w-0 ${cls}`}
                />
              </div>
            )}
          </AccessibleField>
        </>
      )}
    </>
  )
}
