import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { EventData, GuestData } from '../types'
import { buildPassUrl } from './qrUrl'
import { formatDate, formatTime12h } from './time'
import { getTemplate } from '../templates/registry'

export interface ExportPdfOptions {
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}

export type ExportPdfResult = 'completed' | 'cancelled'

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lighten([r, g, b]: Rgb, amount: number): Rgb {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount].map(Math.round) as Rgb
}

// Plantillas serif (Boda, Graduación, Evento formal) usan una fuente de
// titular con serifas en el PDF para evocar la misma sensación "editorial"
// que su tema web; el resto usa sans. jsPDF solo trae 14 fuentes núcleo
// (sin Cormorant/Cinzel/Rye/Baloo), así que esto es la aproximación más
// cercana sin tener que empotrar archivos de fuente externos.
const SERIF_TEMPLATES = new Set(['wedding', 'graduation', 'formal'])

// Deriva la paleta del PDF a partir de la MISMA fuente de verdad que el tema
// web del evento (src/templates/registry.ts), para que el pase impreso se
// sienta del mismo evento que la invitación digital en vez de usar siempre
// los mismos colores fijos sin importar la plantilla elegida.
function getPdfPalette(templateId: EventData['templateId']) {
  const template = getTemplate(templateId)
  const text = hexToRgb(template.vars.text)
  const muted = hexToRgb(template.vars.textMuted)
  return {
    headFont: SERIF_TEMPLATES.has(template.id) ? ('times' as const) : ('helvetica' as const),
    headerBg: hexToRgb(template.vars.accentDark),
    accent: hexToRgb(template.vars.accent),
    text,
    muted,
    faint: lighten(muted, 0.35),
    cardBg: hexToRgb(template.vars.accentSoft),
    link: hexToRgb(template.vars.accentDark),
  }
}

// Generar 1 página + 1 QR por invitado es CPU-intensivo (QRCode.toDataURL y
// jsPDF dibujan de forma síncrona, pese al `await`: solo libera un microtask,
// no un macrotask). Sin ceder el hilo, un evento de miles de invitados
// congela la pestaña por completo durante toda la generación. Cada
// `YIELD_EVERY` invitados se cede el control real al navegador (setTimeout,
// no microtask) para que pueda repintar, atender clicks (incl. "Cancelar") y
// no se marque como "no responde".
const YIELD_EVERY = 15

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function exportGuestPassesPdf(
  event: EventData,
  guests: GuestData[],
  options: ExportPdfOptions = {},
): Promise<ExportPdfResult> {
  const { onProgress, isCancelled } = options
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  const palette = getPdfPalette(event.templateId)
  const { headFont } = palette

  for (let i = 0; i < guests.length; i++) {
    if (isCancelled?.()) return 'cancelled'

    const guest = guests[i]
    if (i > 0) doc.addPage()

    const passUrl = buildPassUrl(event.id, guest.qrToken)
    const qrDataUrl = await QRCode.toDataURL(passUrl, { width: 300, margin: 1 })

    // Encabezado: banda de ancho completo en el color "accentDark" de la
    // plantilla del evento con el nombre del evento en blanco y un filete
    // del color "accent" debajo, separando la identidad del evento del
    // resto del pase (antes era texto plano negro sin jerarquía visual).
    const headerHeight = 30
    doc.setFillColor(...palette.headerBg)
    doc.rect(0, 0, pageWidth, headerHeight, 'F')
    doc.setFillColor(...palette.accent)
    doc.rect(0, headerHeight, pageWidth, 1.5, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFont(headFont, 'bold')
    doc.setFontSize(20)
    doc.text(event.name, pageWidth / 2, headerHeight / 2 + 3, { align: 'center' })

    // El resto del layout fluye de arriba hacia abajo con un cursor `y`
    // en vez de posiciones fijas, para que la fecha/hora/ubicación se
    // ajusten a varias líneas sin solaparse ni cortarse (antes era una
    // sola línea que se salía de la página con eventos largos).
    let y = headerHeight + 10

    doc.setFont(headFont, 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...palette.text)
    doc.text(formatDate(event.date), pageWidth / 2, y, { align: 'center' })
    y += 7

    const timeLabel = event.startTime
      ? `${formatTime12h(event.startTime)}${event.endTime ? `–${formatTime12h(event.endTime)}` : ''}`
      : ''
    const infoLine = timeLabel ? `${event.location}  ·  ${timeLabel}` : event.location
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...palette.muted)
    const infoLines = doc.splitTextToSize(infoLine, contentWidth)
    infoLines.forEach((line: string, idx: number) => {
      doc.text(line, pageWidth / 2, y + idx * 5, { align: 'center' })
    })
    y += infoLines.length * 5 + 8

    // Filete decorativo (color "accent" de la plantilla) que separa los
    // datos del evento de los del invitado.
    doc.setFillColor(...palette.accent)
    doc.rect(pageWidth / 2 - 20, y, 40, 0.6, 'F')
    y += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...palette.faint)
    doc.text('INVITADO', pageWidth / 2, y, { align: 'center' })
    y += 8

    const fullName = `${guest.name} ${guest.lastName || ''}`.trim()
    doc.setFont(headFont, 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...palette.text)
    doc.text(fullName, pageWidth / 2, y, { align: 'center' })
    y += 14

    const qrSize = 68
    const qrY = y
    // Marco alrededor del QR (color "accent" de la plantilla) en vez de
    // pegarlo directo a la hoja.
    doc.setDrawColor(...palette.accent)
    doc.setLineWidth(1)
    doc.rect((pageWidth - qrSize) / 2 - 4, qrY - 4, qrSize + 8, qrSize + 8)
    doc.addImage(qrDataUrl, 'PNG', (pageWidth - qrSize) / 2, qrY, qrSize, qrSize)
    y += qrSize + 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...palette.muted)
    doc.text('Presenta este código QR en la entrada', pageWidth / 2, y, { align: 'center' })
    y += 12

    // Tarjeta de detalles: aprovecha el espacio que antes quedaba en blanco
    // debajo del QR para mostrar la ubicación completa (con enlace al mapa
    // si el evento lo tiene) y la lista de acompañantes de este invitado.
    const colWidth = contentWidth / 2 - 16
    const leftX = margin + 8
    const rightX = margin + contentWidth / 2 + 8

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    const locationLines = doc.splitTextToSize(event.location, colWidth)
    const MAX_COMPANIONS_SHOWN = 6
    const companions = guest.companions || []
    const companionLines = companions.length
      ? companions.slice(0, MAX_COMPANIONS_SHOWN).map((c, idx) => {
          const cName = `${c.name || ''} ${c.lastName || ''}`.trim()
          return `• ${cName || `Acompañante ${idx + 1}`}`
        })
      : ['Pase individual']
    if (companions.length > MAX_COMPANIONS_SHOWN) {
      companionLines.push(`+ ${companions.length - MAX_COMPANIONS_SHOWN} más`)
    }

    const titleHeight = 6
    const leftContentHeight = locationLines.length * 5 + (event.mapsUrl ? 7 : 0)
    const rightContentHeight = companionLines.length * 5
    const cardHeight = titleHeight + Math.max(leftContentHeight, rightContentHeight) + 10

    doc.setFillColor(...palette.cardBg)
    doc.setDrawColor(...palette.accent)
    doc.setLineWidth(0.4)
    doc.rect(margin, y, contentWidth, cardHeight, 'FD')

    const innerY = y + 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...palette.text)
    doc.text('UBICACIÓN', leftX, innerY)
    doc.text('ACOMPAÑANTES', rightX, innerY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...palette.muted)
    locationLines.forEach((line: string, idx: number) => {
      doc.text(line, leftX, innerY + 6 + idx * 5)
    })
    if (event.mapsUrl) {
      doc.setTextColor(...palette.link)
      doc.textWithLink('Ver ubicación en el mapa', leftX, innerY + 6 + locationLines.length * 5, {
        url: event.mapsUrl,
      })
      doc.setTextColor(...palette.muted)
    }

    if (!companions.length) doc.setFont('helvetica', 'italic')
    companionLines.forEach((line: string, idx: number) => {
      doc.text(line, rightX, innerY + 6 + idx * 5)
    })
    doc.setFont('helvetica', 'normal')

    y += cardHeight + 10

    if (event.description) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...palette.muted)
      const descLines = doc.splitTextToSize(event.description, contentWidth).slice(0, 2)
      descLines.forEach((line: string, idx: number) => {
        doc.text(line, pageWidth / 2, y + idx * 5, { align: 'center' })
      })
      doc.setFont('helvetica', 'normal')
    }

    // Aviso de seguridad, mismo texto que la versión web del pase
    // (PassSecurityNotice.tsx) — pase personal, no debe compartirse.
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(...palette.muted)
    doc.text('Pase personal e intransferible · No compartir · Preséntalo el día del evento', pageWidth / 2, pageHeight - 14, {
      align: 'center',
    })
    doc.setFont('helvetica', 'normal')

    // Pie de página, ancla visual consistente con el encabezado en cada
    // página del PDF (uno por invitado), también en el color "accent" de
    // la plantilla.
    doc.setFontSize(7)
    doc.setTextColor(...palette.faint)
    doc.text(`Pase ${i + 1} de ${guests.length}  ·  PaseLink`, pageWidth / 2, pageHeight - 8, { align: 'center' })
    doc.setFillColor(...palette.accent)
    doc.rect(0, pageHeight - 4, pageWidth, 4, 'F')
    doc.setTextColor(0)

    onProgress?.(i + 1, guests.length)

    if ((i + 1) % YIELD_EVERY === 0) {
      await yieldToBrowser()
    }
  }

  if (isCancelled?.()) return 'cancelled'

  doc.save(`${event.name.replace(/\s+/g, '_')}_pases.pdf`)
  return 'completed'
}
