import { useRef, useState } from 'react'
import type { EventData, GuestData } from '../types'

// Extraído de EventDetail.tsx (Subfase 3.3): exportación PDF/Excel de la
// lista de invitados. `event` puede ser null porque el hook se llama antes
// del guard `if (!event) return` de la página (las reglas de hooks no
// permiten llamarlo después de un return condicional).
//
// PDF y Excel comparten `exporting`/`exportProgress`/`exportCancelledRef`:
// los botones de disparo ya se deshabilitan mutuamente mientras cualquiera
// de las dos corre (ver EventDetail.tsx), así que nunca compiten por el
// mismo estado.
export function useEventExport(event: EventData | null, guests: GuestData[]) {
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)
  const [exportPdfError, setExportPdfError] = useState('')
  const [exportExcelError, setExportExcelError] = useState('')
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

  async function handleExportExcel() {
    if (!event) return
    setExporting(true)
    setExportExcelError('')
    setExportProgress({ done: 0, total: guests.length })
    exportCancelledRef.current = false
    try {
      const { exportGuestListExcel } = await import('../utils/exportExcel')
      const result = await exportGuestListExcel(event, guests, {
        onProgress: (done, total) => setExportProgress({ done, total }),
        isCancelled: () => exportCancelledRef.current,
      })
      if (result === 'cancelled') {
        setExportExcelError('Exportación cancelada.')
      }
    } catch (err) {
      console.error('Error exporting guest list Excel:', err)
      setExportExcelError('No se pudo generar el Excel. Intenta de nuevo.')
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  function handleCancelExport() {
    exportCancelledRef.current = true
  }

  return {
    exporting,
    exportProgress,
    exportPdfError,
    exportExcelError,
    handleExportPdf,
    handleExportExcel,
    handleCancelExport,
  }
}
