import type { CustomField, CustomFieldType } from '../types'

// Traduce el tipo elegido por el organizador (CustomFieldsBuilder.tsx) al
// <input type>/inputMode real que debe ver quien completa el campo — antes
// esa traducción vivía inline y duplicada en EventJoin.tsx (única que la
// tenía bien) mientras GuestAddForm.tsx y CustomFieldsEditor.tsx hardcodeaban
// type="text" sin importar el tipo configurado, así que el teclado numérico/
// email/teléfono nunca aparecía para esos dos flujos.
const HTML_TYPE_BY_FIELD_TYPE: Record<CustomFieldType, string> = {
  text: 'text',
  number: 'number',
  email: 'email',
  phone: 'tel',
}

const INPUT_MODE_BY_FIELD_TYPE: Record<CustomFieldType, 'text' | 'numeric' | 'email' | 'tel'> = {
  text: 'text',
  number: 'numeric',
  email: 'email',
  phone: 'tel',
}

// Recibe el CustomField completo (no solo el `type`) para devolver también
// `required`: el modelo de datos ya lo tiene (CustomFieldsBuilder.tsx), pero
// solo EventJoin.tsx lo pasaba a mano al <input> — GuestAddForm/
// CustomFieldsEditor nunca lo aplicaban, así que un campo obligatorio del
// organizador no se anunciaba como tal en esos dos flujos.
export function customFieldInputProps(field: Pick<CustomField, 'type' | 'required'>): { type: string; inputMode: 'text' | 'numeric' | 'email' | 'tel'; required: boolean } {
  return {
    type: HTML_TYPE_BY_FIELD_TYPE[field.type],
    inputMode: INPUT_MODE_BY_FIELD_TYPE[field.type],
    required: field.required,
  }
}
