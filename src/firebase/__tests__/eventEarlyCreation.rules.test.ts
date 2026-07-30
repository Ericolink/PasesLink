import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { createTestEnv, getEventDoc, type EmulatorFirestore } from './helpers'

// Mismo mock que events.rules.test.ts: redirige el `db` singleton de
// events.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { createEvent, updateEventDetails, type NewEventInput, type UpdateEventInput } from '../events'

const OWNER_UID = 'owner-uid'

// Lo mínimo que el wizard ya tiene en cuanto termina el paso 2 (Información
// básica) — capacity/maxCompanions/paymentMethods vienen con los defaults
// del estado inicial del formulario (ver EventCreate.tsx), no de un paso
// que el organizador todavía no visitó.
const MINIMAL_INPUT: NewEventInput = {
  name: 'Fiesta de prueba',
  date: '2026-12-01',
  location: 'Salón de prueba',
  entryMode: 'list',
  capacity: 100,
  maxCompanions: 0,
  requiresPayment: false,
}

// Fase 3 del rediseño del wizard: prueba, contra el emulador (nunca contra
// producción — ver política del proyecto), que la secuencia real que hace
// persistProgress() en EventCreate.tsx (un create temprano con datos
// mínimos + varios update incrementales del dueño simulando cada paso)
// funciona bajo las reglas de Firestore tal como están HOY, sin ningún
// cambio en firestore.rules — ver justificación en el plan de la Fase 3.
describe('EventCreate — creación temprana + actualización incremental', () => {
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

  it('crea el evento con datos mínimos apenas termina el paso 2, sin exigir el resto de los campos', async () => {
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const eventId = await createEvent(OWNER_UID, MINIMAL_INPUT)

    const doc = await getEventDoc(testEnv, eventId)
    expect(doc?.name).toBe('Fiesta de prueba')
    expect(doc?.status).toBe('active')
    expect(doc?.coverImage).toBe('')
    expect(doc?.templateId).toBe('default')
  })

  it('el dueño puede actualizar el evento recién creado varias veces seguidas (uno por cada paso siguiente del wizard)', async () => {
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
    const eventId = await createEvent(OWNER_UID, MINIMAL_INPUT)

    // Paso 3: imagen y colores.
    const afterStep3: UpdateEventInput = { ...MINIMAL_INPUT, coverImage: 'https://cdn.example/cover.jpg', accentColor: '#ff0000' }
    await updateEventDetails(eventId, afterStep3)

    // Paso 4: descripción y programa.
    const afterStep4: UpdateEventInput = { ...afterStep3, description: 'Una descripción de prueba', dressCode: 'Casual' }
    await updateEventDetails(eventId, afterStep4)

    // Paso 5: capacidad/pago reales, ya no los defaults.
    const afterStep5: UpdateEventInput = {
      ...afterStep4,
      capacity: 250,
      maxCompanions: 2,
      requiresPayment: true,
      paymentMethods: ['transfer'],
      ticketPrice: 5000,
      currency: '$',
    }
    await updateEventDetails(eventId, afterStep5)

    const doc = await getEventDoc(testEnv, eventId)
    expect(doc?.coverImage).toBe('https://cdn.example/cover.jpg')
    expect(doc?.description).toBe('Una descripción de prueba')
    expect(doc?.capacity).toBe(250)
    expect(doc?.requiresPayment).toBe(true)
    expect(doc?.ticketPrice).toBe(5000)
  })

  it('alguien que no es el dueño no puede actualizar el borrador recién creado', async () => {
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
    const eventId = await createEvent(OWNER_UID, MINIMAL_INPUT)

    dbHolder.db = testEnv.authenticatedContext('otro-uid').firestore()
    await expect(updateEventDetails(eventId, { ...MINIMAL_INPUT, name: 'Nombre hackeado' })).rejects.toThrow()
  })
})
