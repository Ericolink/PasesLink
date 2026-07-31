import { useState } from 'react'
import type { EventData, PaymentMethod } from '../../types'
import { disableConcessions, enableConcessionsBeta, updateConcessionsSettings } from '../../firebase/concessions'
import { PAYMENT_METHOD_LABELS } from '../../utils/paymentMethods'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { AccessibleField, Checkbox, TextField } from '../accessibility/AccessibleField'
import { ConfirmDialog } from '../ConfirmDialog'

interface Props {
  event: EventData
  canManage: boolean
  isAdmin: boolean
}

const ALL_METHODS: PaymentMethod[] = ['transfer', 'cash']

function PaymentMethodsPicker({ value, onChange }: { value: PaymentMethod[]; onChange: (next: PaymentMethod[]) => void }) {
  function toggle(method: PaymentMethod) {
    onChange(value.includes(method) ? value.filter((m) => m !== method) : [...value, method])
  }
  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Métodos de cobro</legend>
      <div className="flex gap-2">
        {ALL_METHODS.map((m) => (
          <label
            key={m}
            className={`flex-1 flex items-center justify-center gap-2 border rounded-lg px-3 py-2.5 text-sm font-medium cursor-pointer transition-colors ${
              value.includes(m) ? 'border-primary bg-primary/10 text-primary' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
            }`}
          >
            <input type="checkbox" checked={value.includes(m)} onChange={() => toggle(m)} className="sr-only" />
            {PAYMENT_METHOD_LABELS[m]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// Antes de activarse (beta, solo un admin de PaseLink puede prender
// `concessions.enabled` — ver firestore.rules) muestra un formulario mínimo
// + el botón de activación. Una vez activo, cualquiera con manageConcessions
// administra la config completa (incluido apagarlo, que no requiere admin).
export function ConcessionSettingsPanel({ event, canManage, isAdmin }: Props) {
  const concessions = event.concessions
  const [storeName, setStoreName] = useState(concessions?.storeName || '')
  // Nunca vacío: firestore.rules exige `currency.size() > 0` en cada
  // producto del catálogo (isValidConcessionItem) — si el evento no tiene
  // moneda configurada (campo vacío en EditEventForm), heredarla tal cual
  // dejaba `concessions.currency: ""` guardado, y CUALQUIER alta de
  // producto se rechazaba con "Missing or insufficient permissions" sin
  // ninguna pista de por qué (bug real encontrado en vivo, 2026-07-31).
  const [currency, setCurrency] = useState(concessions?.currency || event.currency || '$')
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(concessions?.paymentMethods || ['transfer'])
  const [useEventInstructions, setUseEventInstructions] = useState(concessions?.useEventPaymentInstructions ?? true)
  const [paymentInstructions, setPaymentInstructions] = useState(concessions?.paymentInstructions || '')
  const [pickupInstructions, setPickupInstructions] = useState(concessions?.pickupInstructions || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmingDisable, setConfirmingDisable] = useState(false)

  async function handleEnable() {
    setError('')
    if (!currency.trim()) {
      setError('Poné un símbolo o código de moneda (ej. "$" o "MXN").')
      return
    }
    setSaving(true)
    try {
      await enableConcessionsBeta(event.id, {
        storeName: storeName.trim() || undefined,
        currency: currency.trim(),
        paymentMethods,
        useEventPaymentInstructions: useEventInstructions,
      })
    } catch (err) {
      console.error('Error al activar el módulo de concessions:', err)
      setError('No se pudo activar el módulo. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    setError('')
    if (paymentMethods.length === 0) {
      setError('Elegí al menos un método de cobro.')
      return
    }
    if (!currency.trim()) {
      setError('Poné un símbolo o código de moneda (ej. "$" o "MXN").')
      return
    }
    setSaving(true)
    try {
      await updateConcessionsSettings(event.id, {
        storeName: storeName.trim() || undefined,
        currency: currency.trim(),
        paymentMethods,
        useEventPaymentInstructions: useEventInstructions,
        paymentInstructions: useEventInstructions ? undefined : paymentInstructions.trim(),
        pickupInstructions: pickupInstructions.trim() || undefined,
      })
    } catch (err) {
      console.error('Error al guardar la configuración de concessions:', err)
      setError('No se pudo guardar la configuración. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable() {
    setConfirmingDisable(false)
    try {
      await disableConcessions(event.id)
    } catch (err) {
      console.error('Error al desactivar el módulo de concessions:', err)
      setError('No se pudo desactivar el módulo. Intenta de nuevo.')
    }
  }

  if (!concessions?.enabled) {
    if (!isAdmin) {
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
          Este módulo está en fase beta y todavía no está disponible para tu cuenta.
        </div>
      )
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Activalo solo para este evento — podés ajustar todo lo demás después.
        </p>
        <TextField label="Nombre de la tienda" id="concessions-store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Barra de Baile Improvisado" />
        <TextField
          label="Moneda"
          id="concessions-currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          placeholder="$"
          helperText={`Símbolo o código para mostrar precios (ej. "$" o "MXN").`}
        />
        <PaymentMethodsPicker value={paymentMethods} onChange={setPaymentMethods} />
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={useEventInstructions} onChange={(e) => setUseEventInstructions(e.target.checked)} />
          <span className="text-sm text-gray-700 dark:text-gray-300">Usar los datos bancarios del evento</span>
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <AccessibleButton loading={saving} onClick={handleEnable}>Activar módulo (beta)</AccessibleButton>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TextField label="Nombre de la tienda" id="concessions-store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Barra de Baile Improvisado" disabled={!canManage} />
      <TextField
        label="Moneda"
        id="concessions-currency"
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        placeholder="$"
        disabled={!canManage}
        helperText={`Símbolo o código para mostrar precios (ej. "$" o "MXN").`}
      />
      <PaymentMethodsPicker value={paymentMethods} onChange={canManage ? setPaymentMethods : () => {}} />
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox checked={useEventInstructions} disabled={!canManage} onChange={(e) => setUseEventInstructions(e.target.checked)} />
        <span className="text-sm text-gray-700 dark:text-gray-300">Usar los datos bancarios del evento</span>
      </label>
      {!useEventInstructions && (
        <AccessibleField label="Datos para transferencia (exclusivos del menú)" id="concessions-payment-instructions">
          {(fieldProps) => (
            <textarea
              {...fieldProps}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              disabled={!canManage}
              rows={3}
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
            />
          )}
        </AccessibleField>
      )}
      <AccessibleField label="Instrucciones de recolección" id="concessions-pickup-instructions" helperText='Ej. "Recoge tu pedido en la barra central".'>
        {(fieldProps) => (
          <textarea
            {...fieldProps}
            value={pickupInstructions}
            onChange={(e) => setPickupInstructions(e.target.value)}
            disabled={!canManage}
            rows={2}
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
          />
        )}
      </AccessibleField>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {canManage && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <AccessibleButton loading={saving} onClick={handleSave}>Guardar</AccessibleButton>
          <AccessibleButton variant="danger-outline" size="sm" onClick={() => setConfirmingDisable(true)}>
            Desactivar módulo
          </AccessibleButton>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDisable}
        title="Desactivar módulo de menú"
        message="Los invitados dejarán de ver la sección de menú en su invitación. El catálogo y los pedidos existentes no se borran — podés volver a activarlo cuando quieras."
        confirmLabel="Desactivar"
        danger
        onConfirm={handleDisable}
        onCancel={() => setConfirmingDisable(false)}
      />
    </div>
  )
}
