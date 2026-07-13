import type { ImportedGuestRow } from '../firebase/guests'

// Parser de CSV manual (sin librería) — soporta campos entre comillas con el
// delimitador/saltos de línea adentro, y comillas escapadas (""). Alcanza
// para el caso real (una exportación de Excel/Sheets), no pretende cubrir
// el 100% del RFC 4180.
function parseCsvText(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === delimiter) {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (char === '\r') {
      i++
      continue
    }
    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += char
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

// Algunas exportaciones regionales de Excel usan ";" como separador (donde
// "," ya es el separador decimal) — se detecta contando en la fila de
// encabezados, no se asume uno fijo.
function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) || []).length
  const semicolons = (headerLine.match(/;/g) || []).length
  return semicolons > commas ? ';' : ','
}

// Rango Unicode de diacríticos combinantes (U+0300–U+036F), construido por
// código de caracter (String.fromCharCode) en vez de un literal de regex —
// así no queda ningún caracter combinante real pegado en el código fuente.
const COMBINING_DIACRITICS_START = 0x0300
const COMBINING_DIACRITICS_END = 0x036f
const COMBINING_DIACRITICS = new RegExp(
  `[${String.fromCharCode(COMBINING_DIACRITICS_START)}-${String.fromCharCode(COMBINING_DIACRITICS_END)}]`,
  'g',
)

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().normalize('NFD').replace(COMBINING_DIACRITICS, '')
}

const HEADER_ALIASES = {
  name: ['nombre', 'name', 'first name', 'firstname', 'nombre completo', 'fullname', 'full name'],
  lastName: ['apellido', 'last name', 'lastname'],
  phone: ['telefono', 'phone', 'celular', 'whatsapp', 'movil', 'numero', 'número'],
  email: ['email', 'correo', 'mail', 'e-mail', 'correo electronico'],
} as const

function matchColumn(headers: string[], aliases: readonly string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader)
  return headers.findIndex((h) => normalizedAliases.includes(normalizeHeader(h)))
}

export interface CsvRowError {
  line: number
  message: string
}

export interface CsvImportResult {
  rows: ImportedGuestRow[]
  rowErrors: CsvRowError[]
  /** null si no se pudo ni siquiera identificar la columna de nombre — nada para importar. */
  headerError: string | null
}

// Fase 1 del import: nombre/apellido/teléfono/email nomás — sin
// acompañantes ni campos personalizados (mismo alcance incremental que ya
// usó, por ejemplo, la auto-edición del invitado). `line` en los errores es
// 1-based y ya cuenta el encabezado, para que coincida con el número de
// fila que el usuario ve si abre el mismo CSV en una planilla.
export function parseGuestsCsv(text: string): CsvImportResult {
  const trimmed = text.trim()
  if (!trimmed) return { rows: [], rowErrors: [], headerError: 'El archivo está vacío.' }

  const firstLine = trimmed.split(/\r?\n/, 1)[0]
  const delimiter = detectDelimiter(firstLine)
  const table = parseCsvText(trimmed, delimiter)
  if (table.length === 0) return { rows: [], rowErrors: [], headerError: 'El archivo está vacío.' }

  const headers = table[0].map((h) => h.trim())
  const nameIdx = matchColumn(headers, HEADER_ALIASES.name)
  if (nameIdx === -1) {
    return {
      rows: [],
      rowErrors: [],
      headerError: 'No se encontró una columna de nombre (ej. "Nombre" o "Name") en la primera fila del archivo.',
    }
  }
  const lastNameIdx = matchColumn(headers, HEADER_ALIASES.lastName)
  const phoneIdx = matchColumn(headers, HEADER_ALIASES.phone)
  const emailIdx = matchColumn(headers, HEADER_ALIASES.email)

  const rows: ImportedGuestRow[] = []
  const rowErrors: CsvRowError[] = []
  for (let i = 1; i < table.length; i++) {
    const cells = table[i]
    const name = cells[nameIdx]?.trim() || ''
    if (!name) {
      rowErrors.push({ line: i + 1, message: 'Fila sin nombre — se omitió.' })
      continue
    }
    rows.push({
      name,
      lastName: lastNameIdx >= 0 ? cells[lastNameIdx]?.trim() || undefined : undefined,
      phone: phoneIdx >= 0 ? cells[phoneIdx]?.trim() || undefined : undefined,
      email: emailIdx >= 0 ? cells[emailIdx]?.trim() || undefined : undefined,
    })
  }
  return { rows, rowErrors, headerError: null }
}
