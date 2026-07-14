import ExcelJS from 'exceljs'
import type { EventData, GuestData } from '../types'
import { RSVP_LABELS, PAYMENT_STATUS_LABELS } from '../types'
import { partySize } from '../firebase/guests'
import { PAYMENT_METHOD_LABELS } from './paymentMethods'
import { getExportPalette } from './exportTheme'
import { formatDate } from './time'

export interface ExportExcelOptions {
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
  // Desactivable en tests (evita depender de `fetch` para un logo que es
  // puramente decorativo) — en la app real siempre viaja en true.
  includeLogo?: boolean
}

export type ExportExcelResult = 'completed' | 'cancelled'

interface ExcelColumn {
  header: string
  get: (guest: GuestData) => string | number
}

function companionsLabel(guest: GuestData): string {
  if (guest.isGroup) return `Grupo de ${partySize(guest)} integrantes`
  if (!guest.companions.length) return ''
  return guest.companions
    .map((c, i) => `${c.name || ''} ${c.lastName || ''}`.trim() || `Acompañante ${i + 1}`)
    .join(', ')
}

// Nombre + Apellido primero (pedido explícito), después los campos
// personalizados del evento en el orden en que el anfitrión los configuró
// (nunca asumidos por nombre fijo), y al final el resto de la operativa del
// invitado (estado, confirmación, check-in, pago). Un evento sin
// `customFields` (todo evento de "Lista" o creado antes de esta función)
// simplemente no agrega columnas de más, cero regresión visual.
function buildColumns(event: EventData): ExcelColumn[] {
  const columns: ExcelColumn[] = [
    { header: 'Nombre', get: (g) => g.name },
    { header: 'Apellido', get: (g) => g.lastName || '' },
    { header: 'Teléfono', get: (g) => g.phone || '' },
    { header: 'Email', get: (g) => g.email || '' },
  ]

  // Dos campos personalizados con la misma etiqueta (nada lo impide hoy en
  // CustomFieldsBuilder) no deben pisarse la columna una a la otra.
  const labelCount = new Map<string, number>()
  for (const field of event.customFields || []) {
    const seen = (labelCount.get(field.label) || 0) + 1
    labelCount.set(field.label, seen)
    const header = seen > 1 ? `${field.label} (${seen})` : field.label
    columns.push({ header, get: (g) => g.customData?.[field.id] || '' })
  }

  columns.push(
    { header: 'Personas', get: (g) => partySize(g) },
    { header: 'Acompañantes', get: (g) => companionsLabel(g) },
    { header: 'Estado', get: (g) => (g.status === 'checked_in' ? 'Asistió' : 'Invitado') },
    { header: 'Confirmación', get: (g) => RSVP_LABELS[g.rsvpStatus] },
    { header: 'Check-in', get: (g) => (g.checkedInAt ? new Date(g.checkedInAt).toLocaleString('es') : '') },
  )

  if (event.requiresPayment) {
    columns.push(
      { header: 'Pago', get: (g) => PAYMENT_STATUS_LABELS[g.paymentStatus] },
      { header: 'Método de pago', get: (g) => (g.paymentMethod ? PAYMENT_METHOD_LABELS[g.paymentMethod] : '') },
    )
  }

  return columns
}

const YIELD_EVERY = 300

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function argb(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`
}

const WHITE = 'FFFFFFFF'

async function loadLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch('/logo-crown.png')
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

// Excel rechaza nombres de hoja con \ / ? * [ ] o de más de 31 caracteres.
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim()
  return (cleaned || 'Invitados').slice(0, 31)
}

const TITLE_ROW = 1
const SUBTITLE_ROW = 2
const META_ROW = 3
const HEADER_ROW = 4
const FIRST_DATA_ROW = 5

// Genera el workbook en memoria (sin disparar la descarga) para que se pueda
// reusar en tests: inspeccionar filas/columnas reales sin depender del DOM
// (Blob/URL.createObjectURL), que solo importan a exportGuestListExcel.
export async function buildGuestListWorkbook(
  event: EventData,
  guests: GuestData[],
  options: ExportExcelOptions = {},
): Promise<{ workbook: ExcelJS.Workbook; result: ExportExcelResult }> {
  const { onProgress, isCancelled, includeLogo = true } = options
  // Misma fuente de verdad que exportPdf.ts (src/utils/exportTheme.ts): el
  // Excel exportado se ve del mismo evento que la invitación digital, sin
  // duplicar ninguna paleta de colores.
  const palette = getExportPalette(event.templateId)
  const fontName = palette.isSerif ? 'Georgia' : 'Calibri'
  const columns = buildColumns(event)
  const lastCol = columns.length

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PaseLink'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sanitizeSheetName(event.name), {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
  })

  // Columna A de las 3 filas de encabezado se deja sin texto (solo el color
  // de fondo) para que el logo, anclado ahí, no se superponga al título.
  sheet.mergeCells(TITLE_ROW, 2, TITLE_ROW, lastCol)
  sheet.mergeCells(SUBTITLE_ROW, 2, SUBTITLE_ROW, lastCol)
  sheet.mergeCells(META_ROW, 2, META_ROW, lastCol)

  sheet.getRow(TITLE_ROW).height = 30
  sheet.getRow(SUBTITLE_ROW).height = 18
  sheet.getRow(META_ROW).height = 16
  sheet.getRow(HEADER_ROW).height = 22

  for (let col = 1; col <= lastCol; col++) {
    sheet.getCell(TITLE_ROW, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(palette.hex.accentDark) } }
    sheet.getCell(SUBTITLE_ROW, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(palette.hex.accentSoft) } }
    sheet.getCell(META_ROW, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(palette.hex.accentSoft) } }
  }

  const titleCell = sheet.getCell(TITLE_ROW, 2)
  titleCell.value = event.name
  titleCell.font = { name: fontName, bold: true, size: 16, color: { argb: WHITE } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }

  const dateLocation = [formatDate(event.date), event.location].filter(Boolean).join(' · ')
  const subtitleCell = sheet.getCell(SUBTITLE_ROW, 2)
  subtitleCell.value = dateLocation
  subtitleCell.font = { name: fontName, bold: true, size: 11, color: { argb: argb(palette.hex.text) } }
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' }

  const exportedAt = new Date().toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' })
  const metaCell = sheet.getCell(META_ROW, 2)
  metaCell.value = `Lista de invitados · Exportado el ${exportedAt} · PaseLink`
  metaCell.font = { name: fontName, italic: true, size: 9, color: { argb: argb(palette.hex.textMuted) } }
  metaCell.alignment = { vertical: 'middle', horizontal: 'left' }

  columns.forEach((col, idx) => {
    const cell = sheet.getCell(HEADER_ROW, idx + 1)
    cell.value = col.header
    cell.font = { name: fontName, bold: true, size: 11, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(palette.hex.accent) } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })

  if (includeLogo) {
    const buffer = await loadLogoBuffer()
    if (buffer) {
      const imageId = workbook.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: 'png' })
      sheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 52, height: 42 } })
    }
  }

  const total = guests.length
  for (let i = 0; i < total; i++) {
    if (isCancelled?.()) return { workbook, result: 'cancelled' }

    const guest = guests[i]
    const rowIndex = FIRST_DATA_ROW + i
    const isOddDataRow = i % 2 === 1
    columns.forEach((col, colIdx) => {
      const cell = sheet.getCell(rowIndex, colIdx + 1)
      cell.value = col.get(guest)
      cell.font = { name: fontName, size: 10, color: { argb: argb(palette.hex.text) } }
      cell.border = { bottom: { style: 'thin', color: { argb: argb(palette.hex.accentSoft) } } }
      if (isOddDataRow) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(palette.hex.accentSoft) } }
      }
    })

    onProgress?.(i + 1, total)
    if ((i + 1) % YIELD_EVERY === 0) {
      await yieldToBrowser()
    }
  }

  if (isCancelled?.()) return { workbook, result: 'cancelled' }

  if (total > 0) {
    sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW + total, column: lastCol } }
  }

  columns.forEach((col, idx) => {
    let maxLen = col.header.length
    for (const guest of guests) {
      maxLen = Math.max(maxLen, String(col.get(guest) ?? '').length)
    }
    sheet.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 2, 10), 45)
  })

  return { workbook, result: 'completed' }
}

export async function exportGuestListExcel(
  event: EventData,
  guests: GuestData[],
  options: ExportExcelOptions = {},
): Promise<ExportExcelResult> {
  const { workbook, result } = await buildGuestListWorkbook(event, guests, options)
  if (result === 'cancelled') return 'cancelled'

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${event.name.replace(/\s+/g, '_')}_invitados.xlsx`
  a.click()
  URL.revokeObjectURL(url)
  return 'completed'
}
