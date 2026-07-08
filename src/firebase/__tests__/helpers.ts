import { readFileSync } from 'fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'

// El `Firestore` que devuelve @firebase/rules-unit-testing es estructuralmente distinto
// (a nivel de tipos) del `Firestore` de 'firebase/firestore', aunque en runtime sea
// compatible. Se deriva el tipo de la propia librería de testing para evitar ese choque.
export type EmulatorFirestore = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>

let envCounter = 0

/** Cada test file (o `describe`) debe pedir su propio entorno para no compartir datos entre suites. */
export async function createTestEnv(): Promise<RulesTestEnvironment> {
  envCounter += 1
  return initializeTestEnvironment({
    projectId: `demo-paselink-test-${Date.now()}-${envCounter}`,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
}

/** Valores mínimos válidos de EventData; los tests solo sobreescriben lo que les importa. */
export function defaultEventData(overrides: Record<string, unknown> = {}) {
  return {
    ownerId: 'owner-uid',
    name: 'Evento de prueba',
    date: '2026-01-01',
    location: 'Salón de prueba',
    entryMode: 'list',
    requiresPayment: false,
    ticketPrice: 0,
    currency: 'USD',
    paymentInstructions: '',
    plan: 'premium',
    paymentStatus: 'free_trial',
    status: 'active',
    guestCount: 0,
    peopleCount: 0,
    checkedInCount: 0,
    occupancyCount: 0,
    paidCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

/** Siempre bypassea firestore.rules: estos datos representan el estado inicial del test, no una acción que las reglas deban validar. */
export async function seedEvent(
  testEnv: RulesTestEnvironment,
  eventId: string,
  overrides: Record<string, unknown> = {},
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'events', eventId), defaultEventData(overrides))
  })
}

/** Perfil mínimo para probar el cross-check de guestPhotoURL en isValidPublicGuestRegistration. */
export async function seedUserProfile(
  testEnv: RulesTestEnvironment,
  uid: string,
  overrides: Record<string, unknown> = {},
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', uid), {
      email: `${uid}@test.com`,
      firstName: 'Test',
      lastName: 'User',
      displayName: 'Test User',
      birthDate: '2000-01-01',
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

export async function seedGuest(
  testEnv: RulesTestEnvironment,
  eventId: string,
  guestId: string,
  overrides: Record<string, unknown> = {},
) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'events', eventId, 'guests', guestId), {
      name: 'Invitado de prueba',
      qrToken: guestId,
      status: 'invited',
      rsvpStatus: 'pending',
      companions: 0,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      lockToken: null,
      paymentStatus: 'unpaid',
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

// `withSecurityRulesDisabled`'s callback is typed `Promise<void>` — su valor de retorno se
// descarta. Por eso el resultado se captura en una variable externa por closure, no con `return`.
export async function getEventDoc(testEnv: RulesTestEnvironment, eventId: string) {
  let result: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'events', eventId))
    result = snap.data()
  })
  return result
}

export async function getGuestDoc(testEnv: RulesTestEnvironment, eventId: string, guestId: string) {
  let result: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'events', eventId, 'guests', guestId))
    result = snap.data()
  })
  return result
}

export async function getGuestContactDoc(testEnv: RulesTestEnvironment, eventId: string, guestId: string) {
  let result: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'events', eventId, 'guestContacts', guestId))
    result = snap.data()
  })
  return result
}

/** Encuentra el id de un guest por su qrToken (registerWalkInGuest solo devuelve el token, no el id). */
export async function guestIdByToken(testEnv: RulesTestEnvironment, eventId: string, qrToken: string): Promise<string> {
  let result = ''
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const q = query(collection(context.firestore(), 'events', eventId, 'guests'), where('qrToken', '==', qrToken))
    const snap = await getDocs(q)
    result = snap.docs[0]?.id || ''
  })
  return result
}
