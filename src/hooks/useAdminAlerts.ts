import { useEffect, useState } from 'react'
import {
  getTodaySendBudgetUsage,
  subscribeToRecentCsvImportFailures,
  subscribeToRecentNotificationFailures,
  subscribeToRecentSendFailures,
  type CsvImportFailureEntry,
  type NotificationFailureEntry,
  type SendFailureEntry,
} from '../firebase/adminAlerts'

type AdminAlertSeverity = 'warning' | 'critical'

export interface AdminAlert {
  id: string
  severity: AdminAlertSeverity
  text: string
  eventId?: string
  timestamp: number
}

// Vive dentro de /admin (ya protegido por AdminRoute), mismo criterio que el
// resto de los hooks del Centro de Control — sin gate de isAdmin propio acá,
// las reglas de Firestore ya rechazan a quien no lo sea.
export function useAdminAlerts() {
  const [sendFailures, setSendFailures] = useState<SendFailureEntry[]>([])
  const [notificationFailures, setNotificationFailures] = useState<NotificationFailureEntry[]>([])
  const [csvImportFailures, setCsvImportFailures] = useState<CsvImportFailureEntry[]>([])
  const [budget, setBudget] = useState<{ count: number; cap: number; fetchedAt: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubSend = subscribeToRecentSendFailures(setSendFailures, (err) => console.error('Error en alertas de envío:', err))
    const unsubNotif = subscribeToRecentNotificationFailures(setNotificationFailures, (err) =>
      console.error('Error en alertas de notificaciones:', err),
    )
    const unsubCsv = subscribeToRecentCsvImportFailures(setCsvImportFailures, (err) =>
      console.error('Error en alertas de importación CSV:', err),
    )
    return () => {
      unsubSend()
      unsubNotif()
      unsubCsv()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getTodaySendBudgetUsage()
      .then((usage) => {
        if (!cancelled) setBudget({ ...usage, fetchedAt: Date.now() })
      })
      .catch((err) => console.error('Error al leer el presupuesto de envío:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const alerts: AdminAlert[] = [
    ...sendFailures.map((f): AdminAlert => ({
      id: `send_${f.id}`,
      severity: 'warning',
      text: `Envío fallido a ${f.toEmail || 'un invitado'}${f.errorMessage ? `: ${f.errorMessage}` : ''}`,
      eventId: f.eventId,
      timestamp: f.sentAt,
    })),
    ...notificationFailures.map((f): AdminAlert => ({
      id: `notif_${f.id}`,
      severity: 'warning',
      text: 'Una notificación push no se pudo entregar',
      eventId: f.eventId,
      timestamp: f.createdAt,
    })),
    ...csvImportFailures.map((f): AdminAlert => ({
      id: `csv_${f.id}`,
      severity: f.status === 'failed' ? 'critical' : 'warning',
      text: `Importación "${f.fileName || 'sin nombre'}" con errores${f.errorMessage ? `: ${f.errorMessage}` : ''} (${f.failedCount} fila${f.failedCount === 1 ? '' : 's'} rechazada${f.failedCount === 1 ? '' : 's'})`,
      eventId: f.eventId,
      timestamp: f.createdAt,
    })),
    ...(budget && budget.count >= budget.cap * 0.9
      ? [{
          id: 'send_budget',
          severity: 'warning' as const,
          text: `Presupuesto de envío diario casi agotado (${budget.count}/${budget.cap})`,
          timestamp: budget.fetchedAt,
        }]
      : []),
  ].sort((a, b) => b.timestamp - a.timestamp)

  return { alerts, loading }
}
