// Acompaña cada escritura de guests/{guestId} hecha desde Admin SDK (Cloud
// Functions) con un avance de `version` + `updatedAt` — mismo campo que
// firestore.rules exige incrementar en +1 para las escrituras directas del
// cliente (ver guestVersionOk ahí y assertGuestVersion en
// src/firebase/guests.ts), pero acá con FieldValue.increment(): el Admin
// SDK ignora las rules, y estas funciones (check-in/checkout/pago/
// reconfirmación) ya corren dentro de su propia transacción con lectura
// fresca inmediata (o son escrituras de un solo campo ya idempotentes, como
// allowGuestReentry) — no necesitan comparar contra una versión "esperada"
// del cliente para evitar un conflicto, solo dejar constancia de que el
// documento cambió, para que `version`/`updatedAt` sigan siendo confiables
// sin importar qué escribió al invitado por última vez.
//
// IMPORTANTE: el resultado de esta función lleva sentinels de Firestore
// (FieldValue), no valores planos — solo sirve para pasarlo directo a
// tx.update()/batch.update()/ref.update(). Nunca lo agregues a un objeto que
// después se reusa para construir la respuesta de la Callable (ver
// mapGuestForResponse en checkin/shared.ts): ahí necesitás el valor real, no
// el sentinel.
import { FieldValue } from 'firebase-admin/firestore'

export function guestVersionFields(): Record<string, FieldValue> {
  return {
    version: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  }
}
