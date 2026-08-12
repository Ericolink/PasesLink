import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'

// Único país por defecto: no todos los teléfonos guardados hoy tienen un
// selector asociado (invitados legacy, CSV, alta rápida sin tocar el
// selector) — ver DEFAULT_COUNTRY en utils/phone.ts, misma elección.
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'MX'

const countryDisplayNames = new Intl.DisplayNames(['es'], { type: 'region' })

// Emoji de bandera a partir del código ISO 3166-1 alpha-2 (ej. "MX" → 🇲🇽):
// cada letra se mapea a su "regional indicator symbol" (U+1F1E6 = 'A').
// Lectores de pantalla anuncian estos emoji por su nombre ("bandera:
// México"), así que la opción sigue siendo identificable sin mostrar el
// nombre del país en texto.
function flagEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('')
}

// Lista completa (no una curada a mano) para no repetir el error que este
// selector viene a arreglar: asumir que solo importan un puñado de países.
// El label ANTES incluía el nombre del país ("México (+52)") pero eso
// obligaba a un control ancho (ver STRUCTURAL_CLASS) que en filas angostas
// (ej. acompañantes en celular) aplastaba el input de teléfono de al lado o
// se salía del contenedor. Ahora el label es solo bandera+código — angosto,
// consistente en toda la app — a costa de perder la búsqueda por nombre al
// escribir en el <select> abierto (el usuario elige a ojo/tacto).
const COUNTRY_OPTIONS: { code: CountryCode; label: string; countryName: string }[] = getCountries()
  .map((code) => ({
    code,
    label: `${flagEmoji(code)} +${getCountryCallingCode(code)}`,
    countryName: countryDisplayNames.of(code) || code,
  }))
  .sort((a, b) => Number(getCountryCallingCode(a.code)) - Number(getCountryCallingCode(b.code)))

interface Props {
  value: CountryCode
  onChange: (value: CountryCode) => void
  id?: string
  className?: string
  'aria-label'?: string
}

// Ancho fijo e independiente del contenido (bandera+código, ej. "🇲🇽 +52"),
// para que el control cerrado sea angosto y predecible en filas apretadas
// (ej. acompañantes en celular) sin depender de cuánto mida el país
// seleccionado. No es overridable por className a propósito: es la única
// forma de garantizar el mismo ancho en los 7 usos de este componente.
const STRUCTURAL_CLASS = 'w-20 shrink-0 truncate'

export function CountryCodeSelect({ value, onChange, id, className, 'aria-label': ariaLabel }: Props) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as CountryCode)}
      className={`${STRUCTURAL_CLASS} ${
        className
        ?? 'border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
      }`}
    >
      {COUNTRY_OPTIONS.map((c) => (
        // `title` (no `label` ni texto extra): el atributo HTML `label` y el
        // contenido del <option> son lo que el navegador muestra tanto
        // cerrado como en la lista abierta — si llevaran el nombre del país
        // el control volvería a ensancharse. `title` solo da un tooltip al
        // pasar el mouse, sin afectar el ancho.
        <option key={c.code} value={c.code} title={c.countryName}>{c.label}</option>
      ))}
    </select>
  )
}
