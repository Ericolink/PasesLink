import { CustomFieldsBuilder } from '../../CustomFieldsBuilder'
import type { CustomField } from '../../../types'

interface StepRegistrationFieldsProps {
  customFields: CustomField[]
  onChange: (fields: CustomField[]) => void
}

export function StepRegistrationFields({ customFields, onChange }: StepRegistrationFieldsProps) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Opcional. Los invitados siempre ingresan nombre y teléfono. Podés agregar campos extra que necesites.
      </p>
      <div className="flex gap-2 text-xs text-gray-400 border border-gray-100 dark:border-gray-700 rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-700/30 mb-4">
        <span className="font-medium text-gray-600 dark:text-gray-300">Fijos:</span> Nombre · Teléfono
      </div>
      <CustomFieldsBuilder fields={customFields} onChange={onChange} />
    </>
  )
}
