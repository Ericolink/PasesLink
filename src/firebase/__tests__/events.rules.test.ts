import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore'
import { createTestEnv, getEventDoc, seedEvent, type EmulatorFirestore } from './helpers'

// Mismo mock que guests.test.ts/wall.test.ts: redirige el `db` singleton de
// events.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { createEvent, updateEventDetails, type NewEventInput, type UpdateEventInput } from '../events'

const OWNER_UID = 'owner-uid'
const EVENT_ID = 'event-1'

const BASE_INPUT: NewEventInput = {
  name: 'Fiesta de prueba',
  date: '2026-12-01',
  location: 'Salón de prueba',
  capacity: 100,
}

const BASE_UPDATE_INPUT: UpdateEventInput = {
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

// Rediseño de métodos de pago (transferencia + efectivo no excluyentes): los
// 5 campos nuevos son strings simples sobre el mismo documento de evento, no
// requieren ninguna regla propia — esto confirma que efectivamente caen bajo
// la regla existente de `allow update` del dueño, sin necesitar un ajuste en
// eventContentCapsOk() ni ninguna otra parte de firestore.rules.
describe('events.ts — campos estructurados de pago (transferencia/efectivo)', () => {
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

  it('allows the owner to write the structured transfer fields and cash message via updateEventDetails', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await updateEventDetails(EVENT_ID, {
      ...BASE_UPDATE_INPUT,
      requiresPayment: true,
      paymentMethods: ['transfer', 'cash'],
      ticketPrice: 5000,
      transferBankName: 'BBVA',
      transferAccountHolder: 'María Pérez',
      transferAccountNumber: '012180001234567895',
      transferReference: 'Nombre + evento',
      cashInstructions: 'Trae cambio exacto.',
    })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.transferBankName).toBe('BBVA')
    expect(event?.transferAccountHolder).toBe('María Pérez')
    expect(event?.transferAccountNumber).toBe('012180001234567895')
    expect(event?.transferReference).toBe('Nombre + evento')
    expect(event?.cashInstructions).toBe('Trae cambio exacto.')
  })
})

// Barrera de seguridad de capacidad, sentido "reducción" (spec §17, complementa
// attendeeLimitOk que ya protege el sentido "alta"): el dueño no puede bajar
// `capacity` (ni activar `attendeeLimitEnabled` recién ahora) a un valor por
// debajo de `peopleCount` ya confirmado. Espejo server-side de
// capacityReductionAllowed (src/firebase/attendeeLimit.ts) — ver ese archivo
// para los tests unitarios de la función pura; acá se prueba que
// updateEventDetails (el único call site) realmente choca contra la regla.
describe('events.ts — capacityReductionOk en updateEventDetails', () => {
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

  it('rejects reducing capacity below the people already confirmed', async () => {
    // Capacidad: 300, personas confirmadas: 280 — el organizador intenta 300 → 200.
    await seedEvent(testEnv, EVENT_ID, { attendeeLimitEnabled: true, capacity: 300, peopleCount: 280 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await expect(updateEventDetails(EVENT_ID, { ...BASE_UPDATE_INPUT, capacity: 200, attendeeLimitEnabled: true })).rejects.toThrow()
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.capacity).toBe(300)
  })

  it('rejects activating the limit for the first time with a capacity already below peopleCount', async () => {
    await seedEvent(testEnv, EVENT_ID, { attendeeLimitEnabled: false, capacity: 200, peopleCount: 220 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await expect(updateEventDetails(EVENT_ID, { ...BASE_UPDATE_INPUT, capacity: 200, attendeeLimitEnabled: true })).rejects.toThrow()
  })

  it('allows raising capacity even if it still falls short of peopleCount', async () => {
    await seedEvent(testEnv, EVENT_ID, { attendeeLimitEnabled: true, capacity: 200, peopleCount: 280 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await updateEventDetails(EVENT_ID, { ...BASE_UPDATE_INPUT, capacity: 250, attendeeLimitEnabled: true })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.capacity).toBe(250)
  })

  it('allows re-saving an inherited over-capacity event untouched (grandfather clause)', async () => {
    await seedEvent(testEnv, EVENT_ID, { attendeeLimitEnabled: true, capacity: 200, peopleCount: 220 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await updateEventDetails(EVENT_ID, { ...BASE_UPDATE_INPUT, name: 'Nombre actualizado', capacity: 200, attendeeLimitEnabled: true })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.name).toBe('Nombre actualizado')
    expect(event?.capacity).toBe(200)
  })

  it('rejects a raw write bypassing updateEventDetails, as a defense-in-depth backstop', async () => {
    await seedEvent(testEnv, EVENT_ID, { attendeeLimitEnabled: true, capacity: 300, peopleCount: 280, ownerId: OWNER_UID })
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

    await expect(updateDoc(doc(ownerDb, 'events', EVENT_ID), { capacity: 200 })).rejects.toThrow()
  })
})
