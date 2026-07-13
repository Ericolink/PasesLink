import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, getDocs } from 'firebase/firestore'
import { createTestEnv, type EmulatorFirestore } from './helpers'

// Mismo mock que guests.test.ts/wall.test.ts: redirige el `db` singleton de
// events.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { createEvent, type NewEventInput } from '../events'

const OWNER_UID = 'owner-uid'

const BASE_INPUT: NewEventInput = {
  name: 'Fiesta de prueba',
  date: '2026-12-01',
  location: 'Salón de prueba',
  capacity: 100,
}

async function countEvents(testEnv: RulesTestEnvironment) {
  let count = 0
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDocs(collection(context.firestore(), 'events'))
    count = snap.size
  })
  return count
}

// Fase 1 de la auditoría de seguridad (issues #92/#98): antes no había
// ninguna validación de servidor sobre el precio de un evento pago — el
// cliente ya arma `ticketPrice: parseFloat(ticketPrice) || 0`, así que un
// evento con `requiresPayment: true` y precio 0 (usuario activa el cobro y
// no llega a tipear el precio, o alguien habla directo contra Firestore)
// se podía crear sin ningún error.
describe('events.ts — isValidEventPricing en create', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await createTestEnv()
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('rejects creating a paid event with ticketPrice 0', async () => {
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await expect(
      createEvent(OWNER_UID, { ...BASE_INPUT, requiresPayment: true, paymentMethods: ['cash'], ticketPrice: 0 }),
    ).rejects.toThrow()
    expect(await countEvents(testEnv)).toBe(0)
  })

  it('rejects creating a paid event without ticketPrice', async () => {
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await expect(
      createEvent(OWNER_UID, { ...BASE_INPUT, requiresPayment: true, paymentMethods: ['cash'] }),
    ).rejects.toThrow()
  })

  it('allows creating a paid event with a positive ticketPrice', async () => {
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await createEvent(OWNER_UID, { ...BASE_INPUT, requiresPayment: true, paymentMethods: ['cash'], ticketPrice: 5000 })

    expect(await countEvents(testEnv)).toBe(1)
  })

  it('allows creating a free event regardless of ticketPrice', async () => {
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await createEvent(OWNER_UID, { ...BASE_INPUT, requiresPayment: false })

    expect(await countEvents(testEnv)).toBe(1)
  })
})
