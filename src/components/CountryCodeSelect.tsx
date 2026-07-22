import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'

// Único país por defecto: no todos los teléfonos guardados hoy tienen un
// selector asociado (invitados legacy, CSV, alta rápida sin tocar el
// selector) — ver DEFAULT_COUNTRY en utils/phone.ts, misma elección.
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'MX'

const countryDisplayNames = new Intl.DisplayNames(['es'], { type: 'region' })

// Lista completa (no una curada a mano) para no repetir el error que este
// selector viene a arreglar: asumir que solo importan un puñado de países.
const COUNTRY_OPTIONS: { code: CountryCode; label: string }[] = getCountries()
  .map((code) => ({
    code,
    label: `${countryDisplayNames.of(code) || code} (+${getCountryCallingCode(code)})`,
  }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'))

interface Props {
  value: CountryCode
  onChange: (value: CountryCode) => void
  id?: string
  className?: string
  'aria-label'?: string
}

export function CountryCodeSelect({ value, onChange, id, className, 'aria-label': ariaLabel }: Props) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as CountryCode)}
      className={
        className
        ?? 'border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
      }
    >
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c.code} value={c.code}>{c.label}</option>
      ))}
    </select>
  )
}
