import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { EventData, GuestData } from '../types'
import { buildPassUrl } from './qrUrl'

export interface ExportPdfOptions {
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}

export type ExportPdfResult = 'completed' | 'cancelled'

const NAVY: [number, number, number] = [26, 58, 92] // #1A3A5C
const GOLD: [number, number, number] = [200, 169, 110] // #C8A96E

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

  for (let i = 0; i < guests.length; i++) {
    if (isCancelled?.()) return 'cancelled'

    const guest = guests[i]
    if (i > 0) doc.addPage()

    const passUrl = buildPassUrl(event.id, guest.qrToken)
    const qrDataUrl = await QRCode.toDataURL(passUrl, { width: 300, margin: 1 })

    // Encabezado: banda navy de ancho completo con el nombre del evento en
    // blanco y un filete dorado debajo, separando la identidad del evento del
    // resto del pase (antes era texto plano negro sin jerarquía visual).
    const headerHeight = 32
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, pageWidth, headerHeight, 'F')
    doc.setFillColor(...GOLD)
    doc.rect(0, headerHeight, pageWidth, 1.5, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(20)
    doc.text(event.name, pageWidth / 2, headerHeight / 2 + 3, { align: 'center' })

    doc.setTextColor(...NAVY)
    doc.setFontSize(12)
    const timeLabel = event.startTime ? `  ·  ⏰ ${event.startTime}${event.endTime ? `–${event.endTime}` : ''}` : ''
    doc.text(`${event.date}  ·  ${event.location}${timeLabel}`, pageWidth / 2, headerHeight + 14, { align: 'center' })

    const qrSize = 80
    const qrY = (pageHeight - qrSize) / 2 - 5
    // Marco dorado alrededor del QR en vez de pegarlo directo a la hoja.
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(1)
    doc.rect((pageWidth - qrSize) / 2 - 4, qrY - 4, qrSize + 8, qrSize + 8)
    doc.addImage(qrDataUrl, 'PNG', (pageWidth - qrSize) / 2, qrY, qrSize, qrSize)

    doc.setTextColor(...NAVY)
    doc.setFontSize(16)
    doc.text(guest.name, pageWidth / 2, qrY + qrSize + 14, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text('Presenta este código QR en la entrada', pageWidth / 2, qrY + qrSize + 21, {
      align: 'center',
    })

    // Pie de página dorado, ancla visual consistente con el encabezado en
    // cada página del PDF (uno por invitado).
    doc.setFillColor(...GOLD)
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
