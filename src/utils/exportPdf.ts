import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { EventData, GuestData } from '../types'

export interface ExportPdfOptions {
  onProgress?: (done: number, total: number) => void
  isCancelled?: () => boolean
}

export type ExportPdfResult = 'completed' | 'cancelled'

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

    const passUrl = `${window.location.origin}/pass/${event.id}/${guest.qrToken}`
    const qrDataUrl = await QRCode.toDataURL(passUrl, { width: 300, margin: 1 })

    doc.setFontSize(18)
    doc.text(event.name, pageWidth / 2, 30, { align: 'center' })

    doc.setFontSize(14)
    doc.text(`${event.date}  ·  ${event.location}`, pageWidth / 2, 40, { align: 'center' })

    const qrSize = 80
    doc.addImage(qrDataUrl, 'PNG', (pageWidth - qrSize) / 2, (pageHeight - qrSize) / 2 - 10, qrSize, qrSize)

    doc.setFontSize(16)
    doc.text(guest.name, pageWidth / 2, (pageHeight + qrSize) / 2 + 5, { align: 'center' })

    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text('Presenta este código QR en la entrada', pageWidth / 2, (pageHeight + qrSize) / 2 + 12, {
      align: 'center',
    })
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
