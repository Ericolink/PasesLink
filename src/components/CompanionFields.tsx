import { useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import type { CompanionData, CustomField } from '../types'
import { IconTrash, IconUserPlus } from './accessibility/AccessibleIcon'
import { ConfirmDialog } from './ConfirmDialog'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from './CountryCodeSelect'
import { AccessibleField } from './accessibility/AccessibleField'
import { CustomFieldInput } from './CustomFieldInput'
import { GUEST_CUSTOM_FIELD_VALUE_MAX } from '../utils/validation'

const COMPANION_INPUT_CLASS =
  'w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary'

export function CompanionFieldsEditor({
  companions,
  onChange,
  allowAddRemove = true,
  maxCompanions,
  limitReachedMessage,
  customFields,
}: {
  companions: CompanionData[]
  onChange: (companions: CompanionData[]) => void
  // false para auto-edición del propio invitado (GuestEditModal): esa vía
  // tiene prohibido cambiar la CANTIDAD de acompañantes (ver
  // isValidGuestSelfEdit en firestore.rules) — solo puede editar los datos
  // de los que ya existen, así que ocultar "agregar"/"quitar" evita una UI
  // que promete algo que el guardado va a rechazar.
  allowAddRemove?: boolean
  // Tope que gatea el botón "+ Agregar acompañante" acá; la barrera real
  // (por si alguien evita esta UI) vive en firebase/guests.ts y
  // firestore.rules. Puede ser EventData.maxCompanions (autoregistro, ver
  // resolveMaxCompanions en firebase/guests.ts) o GUEST_MAX_COMPANIONS (alta/
  // edición manual del organizador, sin tope de evento — ver
  // GuestData.registrationSource) según quién llame.
  maxCompanions: number
  // Mensaje al llegar al tope. Default asume que `maxCompanions` es la
  // configuración de autoregistro de ESTE evento. Pasar uno propio cuando
  // representa otra cosa (ej. el techo técnico del alta manual del
  // organizador, que no es una restricción administrativa del evento).
  limitReachedMessage?: string
  // Campos personalizados a pedir POR CADA acompañante — ya filtrados por el
  // llamador a los marcados `appliesToCompanions` (mismo criterio que
  // EventJoin.tsx usa para el auto-registro; ver validateOrganizerCompanions/
  // validatePublicCompanions del lado del servidor). Sin esta prop, no se
  // renderiza ningún campo personalizado por acompañante.
  customFields?: CustomField[]
}) {
  // Confirmación antes de quitar — antes el botón de la papelera borraba la
  // fila al instante, sin deshacer posible ni pregunta, fácil de tocar sin
  // querer en una lista que se toca seguido para editar los campos vecinos.
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null)

  function addCompanion() {
    onChange([...companions, {}])
  }

  function removeCompanion(index: number) {
    onChange(companions.filter((_, i) => i !== index))
  }

  function updateCompanion(index: number, field: keyof CompanionData, value: string) {
    onChange(companions.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  function updateCompanionCustomField(index: number, fieldId: string, value: string) {
    onChange(companions.map((c, i) => (i === index ? { ...c, customData: { ...c.customData, [fieldId]: value } } : c)))
  }

  const pendingCompanion = pendingRemoveIndex !== null ? companions[pendingRemoveIndex] : null
  const atLimit = companions.length >= maxCompanions

  return (
    <div className="space-y-2">
      {allowAddRemove && (
        atLimit ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {limitReachedMessage ?? (maxCompanions > 0
              ? `Alcanzaste el máximo de acompañantes permitidos para este evento (${maxCompanions}).`
              : 'Este evento no permite acompañantes.')}
          </p>
        ) : (
          <button
            type="button"
            onClick={addCompanion}
            className="w-full min-h-11 flex items-center justify-center gap-2 rounded-md border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-white hover:border-primary hover:text-primary active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
          >
            <IconUserPlus className="w-4 h-4" />
            Agregar acompañante
          </button>
        )
      )}
      {companions.map((companion, index) => {
        // Con 2+ acompañantes, cada fila repetía "Nombre (opcional)"/
        // "Apellido (opcional)"/"Teléfono (opcional)" idéntico — un lector de
        // pantalla no podía distinguir en cuál acompañante estaba parado. El
        // label real (oculto, el placeholder visible no cambia) ahora incluye
        // el número de orden.
        const humanIndex = index + 1
        return (
        <div key={index} className="space-y-2 bg-gray-50 dark:bg-gray-700/50 rounded-md p-2">
        {allowAddRemove && (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Acompañante {humanIndex}
            </span>
            <button
              type="button"
              onClick={() => setPendingRemoveIndex(index)}
              className="min-w-11 min-h-11 -my-1 -mr-1 inline-flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
              aria-label={`Eliminar acompañante ${humanIndex}`}
            >
              <IconTrash className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2">
          <AccessibleField label={`Nombre del acompañante ${humanIndex} (opcional)`} labelClassName="sr-only">
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="text"
                placeholder="Nombre (opcional)"
                value={companion.name || ''}
                onChange={(e) => updateCompanion(index, 'name', e.target.value)}
                className={COMPANION_INPUT_CLASS}
              />
            )}
          </AccessibleField>
          <AccessibleField label={`Apellido del acompañante ${humanIndex} (opcional)`} labelClassName="sr-only">
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="text"
                placeholder="Apellido (opcional)"
                value={companion.lastName || ''}
                onChange={(e) => updateCompanion(index, 'lastName', e.target.value)}
                className={COMPANION_INPUT_CLASS}
              />
            )}
          </AccessibleField>
          <div className="flex items-center gap-1">
            <CountryCodeSelect
              value={(companion.phoneCountry as CountryCode) || DEFAULT_PHONE_COUNTRY}
              onChange={(v) => updateCompanion(index, 'phoneCountry', v)}
              aria-label={`País del teléfono del acompañante ${humanIndex}`}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <AccessibleField label={`Teléfono del acompañante ${humanIndex} (opcional)`} labelClassName="sr-only" className="flex-1 min-w-0">
              {(fieldProps) => (
                <input
                  {...fieldProps}
                  type="tel"
                  placeholder="Teléfono (opcional)"
                  value={companion.phone || ''}
                  onChange={(e) => updateCompanion(index, 'phone', e.target.value)}
                  className={COMPANION_INPUT_CLASS}
                />
              )}
            </AccessibleField>
          </div>
        </div>
        {customFields && customFields.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {customFields.map((field) => (
              <AccessibleField
                key={field.id}
                label={`${field.label} del acompañante ${humanIndex}${field.required ? '' : ' (opcional)'}`}
                required={field.required}
                labelClassName="sr-only"
              >
                {(fieldProps) => (
                  <CustomFieldInput
                    field={field}
                    fieldProps={fieldProps}
                    placeholder={field.label}
                    maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                    value={companion.customData?.[field.id] || ''}
                    onChange={(v) => updateCompanionCustomField(index, field.id, v)}
                    className={COMPANION_INPUT_CLASS}
                  />
                )}
              </AccessibleField>
            ))}
          </div>
        )}
        </div>
        )
      })}

      <ConfirmDialog
        open={pendingRemoveIndex !== null}
        title="¿Quitar acompañante?"
        message={
          pendingCompanion?.name
            ? `Se quitará a "${pendingCompanion.name}${pendingCompanion.lastName ? ` ${pendingCompanion.lastName}` : ''}" de la lista.`
            : 'Se quitará este acompañante de la lista.'
        }
        confirmLabel="Quitar"
        danger
        onConfirm={() => {
          if (pendingRemoveIndex !== null) removeCompanion(pendingRemoveIndex)
          setPendingRemoveIndex(null)
        }}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </div>
  )
}
