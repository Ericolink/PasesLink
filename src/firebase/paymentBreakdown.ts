import { collection, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from './config'
import type { PaymentMethod } from '../types'

// Desglose de pagos confirmados por método — solo tiene sentido cuando el
// evento acepta 2+ métodos (con uno solo, el total ya cuenta todo). Mismo
// patrón de agregación server-side que src/firebase/platformUsage.ts:
// `null` = "no se pudo calcular" (permission-denied puntual), nunca "cero".
export async function getPaymentMethodBreakdown(
  eventId: string,
  methods: PaymentMethod[],
): Promise<Partial<Record<PaymentMethod, number | null>>> {
  const guestsCol = collection(db, 'events', eventId, 'guests')
  const entries = await Promise.all(
    methods.map(async (method) => {
      try {
        const snap = await getCountFromServer(
          query(guestsCol, where('paymentStatus', '==', 'paid'), where('paymentMethod', '==', method)),
        )
        return [method, snap.data().count] as const
      } catch (err) {
        console.error(`paymentBreakdown: no se pudo calcular "${method}"`, err)
        return [method, null] as const
      }
    }),
  )
  return Object.fromEntries(entries)
}
