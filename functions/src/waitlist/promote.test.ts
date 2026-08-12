import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, getWaitlistEntry, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { attemptPromote, cancelOffer, MIN_TIME_BEFORE_EVENT_MS, type AttemptPromoteResult } from './promote.js'

// Ver el comentario dentro del test de carrera: el emulador de Firestore
// puede rechazar el reintento automático de una transacción con aggregate
// query con este error puntual (INVALID_ARGUMENT, no retryable por el SDK)
// en vez de dejar que el retry limpio suceda como en producción.
function isEmulatorTransactionInvalidatedError(reason: unknown): boolean {
  const code = (reason as { code?: number })?.code
  const message = String((reason as { details?: string; message?: string })?.details ?? (reason as Error)?.message ?? '')
  return code === 3 && /transaction is invalid or closed/i.test(message)
}

describe('attemptPromote', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('offers a waiting entry that fits within remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 1 })

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('offered')
    expect(entry?.offerToken).toBe(result.offerToken)
    expect(entry?.offerExpiresAt).toBeNull()
    expect(entry?.promotionReason).toBe('fifo')
  })

  it('rejects when the party does not fit in the remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 2 })

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'no_capacity' })
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
  })

  it('accounts for other already-offered entries when computing remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 8 })
    // Ya hay una oferta activa de 2 personas — solo queda 0 lugares reales
    // aunque peopleCount (8) + capacity (10) sugiera 2 libres.
    await seedWaitlistEntry(db, eventId, 'already-offered', { status: 'offered', partySize: 2, offerToken: 'x', offerExpiresAt: Date.now() + 1000 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 1 })

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'no_capacity' })
  })

  it('rejects an entry that is not waiting', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'promoted' })

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'not_waiting' })
  })

  it('rejects a missing entry', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await attemptPromote(db, eventId, 'does-not-exist', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('refuses to offer when the event starts in less than the minimum window', async () => {
    const eventId = uniqueId('event')
    // eventStartMs (promote.ts) parsea `${date}T${startTime}:00` como hora
    // LOCAL (sin sufijo Z) — hay que construir date/startTime a partir de
    // los mismos componentes locales, nunca mezclar con toISOString (UTC),
    // o el offset horario local puede hacer que el test compare contra un
    // instante equivocado.
    const soon = new Date(Date.now() + MIN_TIME_BEFORE_EVENT_MS / 2)
    const pad = (n: number) => String(n).padStart(2, '0')
    await seedEvent(db, eventId, {
      capacity: 10,
      peopleCount: 0,
      date: `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}`,
      startTime: `${pad(soon.getHours())}:${pad(soon.getMinutes())}`,
    })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    const result = await attemptPromote(db, eventId, 'entry-1', 'fifo')

    expect(result).toEqual({ ok: false, reason: 'event_too_close' })
  })

  it('never lets two simultaneous promotions of the same entry both succeed', async () => {
    // Mismo escenario de carrera que ya prueba capacity.test.ts para
    // registerWalkInGuest, aplicado acá: dos intentos de ofertar LA MISMA
    // entrada al mismo tiempo (ej. la cascada automática y una asignación
    // manual del organizador apuntando a la misma persona).
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 1 })

    const reasons = ['fifo', 'manual'] as const
    const settled = await Promise.allSettled(reasons.map((reason) => attemptPromote(db, eventId, 'entry-1', reason)))

    // Bajo carga (ej. corriendo junto al resto de la suite), el emulador de
    // Firestore puede abortar una de las dos transacciones por contención
    // ("Transaction lock timeout" en su ReactiveLockManager) y, al
    // reintentarla automáticamente el SDK, la re-consulta agregada
    // (offeredAgg, más arriba en promote.ts) dentro de esa transacción falla
    // con "Transaction is invalid or closed" — un INVALID_ARGUMENT que el
    // SDK no reintenta porque no lo reconoce como transitorio. Es un bug
    // conocido del emulador al reintentar transacciones con aggregate
    // queries (reproducido de forma aislada generando carga artificial de
    // transacciones concurrentes contra el emulador), no algo que pueda
    // pasar contra Firestore real: ahí la transacción perdedora reintenta
    // limpio y devuelve not_waiting. Por eso un rechazo con ESE error puntual
    // cuenta como "esta oferta no tuvo éxito", igual que un ok:false —
    // cualquier otro rechazo sigue siendo una falla real del test.
    for (const outcome of settled) {
      if (outcome.status === 'rejected' && !isEmulatorTransactionInvalidatedError(outcome.reason)) {
        throw outcome.reason
      }
    }

    const succeededIndexes = settled
      .map((outcome, index) => (outcome.status === 'fulfilled' && outcome.value.ok ? index : -1))
      .filter((index) => index !== -1)
    expect(succeededIndexes).toHaveLength(1)

    // El estado final en Firestore debe reflejar exactamente ese único
    // resultado exitoso — nunca los datos de la otra promoción, ni una mezcla.
    const winnerIndex = succeededIndexes[0]
    const winner = settled[winnerIndex] as PromiseFulfilledResult<Extract<AttemptPromoteResult, { ok: true }>>
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('offered')
    expect(entry?.offerToken).toBe(winner.value.offerToken)
    expect(entry?.promotionReason).toBe(reasons[winnerIndex])
  })
})

describe('cancelOffer', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('reverts an offered entry back to waiting, keeping its queue position', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedWaitlistEntry(db, eventId, 'entry-1', {
      status: 'offered', offerToken: 'token-1', priorityBoost: 3, createdAt: 1000,
    })

    const result = await cancelOffer(db, eventId, 'entry-1')

    expect(result).toEqual({ ok: true })
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
    expect(entry?.offerToken).toBeNull()
    expect(entry?.promotionReason).toBeNull()
    // No fue elección del invitado — conserva su lugar en la fila.
    expect(entry?.priorityBoost).toBe(3)
    expect(entry?.createdAt).toBe(1000)
  })

  it('rejects cancelling an entry that is not currently offered', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'waiting' })

    const result = await cancelOffer(db, eventId, 'entry-1')

    expect(result).toEqual({ ok: false, reason: 'not_offered' })
  })

  it('rejects a missing entry', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await cancelOffer(db, eventId, 'does-not-exist')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
