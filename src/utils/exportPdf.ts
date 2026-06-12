import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { EventData, GuestData } from '../types'

export async function exportGuestPassesPdf(event: EventData, guests: GuestData[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  for (let i = 0; i < guests.length; i++) {
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
  }

  doc.save(`${event.name.replace(/\s+/g, '_')}_pases.pdf`)
}
