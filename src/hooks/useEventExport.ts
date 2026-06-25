import { useRef, useState } from 'react'
import type { EventData, GuestData } from '../types'

// Extraído de EventDetail.tsx (Subfase 3.3): exportación PDF/CSV de la
// lista de invitados. `event` puede ser null porque el hook se llama antes
// del guard `if (!event) return` de la página (las reglas de hooks no
// permiten llamarlo después de un return condicional).
export function useEventExport(event: EventData | null, guests: GuestData[]) {
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)
  const [exportPdfError, setExportPdfError] = useState('')
  const exportCancelledRef = useRef(false)

  async function handleExportPdf() {
    if (!event) return
    setExporting(true)
    setExportPdfError('')
    setExportProgress({ done: 0, total: guests.length })
    exportCancelledRef.current = false
    try {
      const { exportGuestPassesPdf } = await import('../utils/exportPdf')
      const result = await exportGuestPassesPdf(event, guests, {
        onProgress: (done, total) => setExportProgress({ done, total }),
        isCancelled: () => exportCancelledRef.current,
      })
      if (result === 'cancelled') {
        setExportPdfError('Exportación cancelada.')
      }
    } catch (err) {
      console.error('Error exporting guest passes PDF:', err)
      setExportPdfError('No se pudo generar el PDF. Intenta de nuevo.')
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  function handleCancelExportPdf() {
    exportCancelledRef.current = true
  }

  function handleExportCsv() {
    if (!event) return
    const rows = [
      [
        'Nombre', 'Apellido', 'Teléfono', 'Acompañantes', 'Estado', 'Confirmación', 'Check-in',
        ...(event.requiresPayment ? ['Pago'] : []),
      ],
      ...guests.map((g) => [
        g.name,
        g.lastName || '',
        g.phone || '',
        String(g.companions.length),
        g.status === 'checked_in' ? 'Asistió' : 'Invitado',
        g.rsvpStatus === 'yes' ? 'Sí' : g.rsvpStatus === 'no' ? 'No' : 'Pendiente',
        g.checkedInAt ? new Date(g.checkedInAt).toLocaleString('es') : '',
        ...(event.requiresPayment ? [g.paymentStatus === 'paid' ? 'Pagó' : 'Pendiente'] : []),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invitados-${event.name.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return { exporting, exportProgress, exportPdfError, handleExportPdf, handleCancelExportPdf, handleExportCsv }
}
