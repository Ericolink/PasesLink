// Harness de tests para Cloud Functions: Admin SDK contra el emulador de
// Firestore (FIRESTORE_EMULATOR_HOST), mismo principio que scripts/*.mjs —
// nunca contra producción. A diferencia de src/firebase/__tests__/helpers.ts
// (que usa @firebase/rules-unit-testing para poder probar las Security
// Rules), acá no hace falta esa librería: el Admin SDK siempre ignora las
// rules, que es exactamente el privilegio real que van a tener las Cloud
// Functions en producción.
import { randomUUID } from 'node:crypto'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'demo-paselink-test'

// Mismo patrón que scripts/send-notifications.mjs: sin credenciales cuando
// FIRESTORE_EMULATOR_HOST está seteado, el emulador no las pide.
export function getTestFirestore(): Firestore {
  if (getApps().length === 0) {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('FIRESTORE_EMULATOR_HOST no está seteado — correr vía `npm run test:functions` (raíz), no directo.')
    }
    initializeApp({ projectId: PROJECT_ID })
  }
  return getFirestore()
}

// Limpia todos los documentos del proyecto emulado entre tests — mismo rol
// que testEnv.clearFirestore() en los tests de rules, vía el endpoint REST
// que expone el propio emulador (no hay equivalente en el Admin SDK).
export async function clearFirestoreEmulator(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  if (!host) return
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' })
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

export async function seedEvent(db: Firestore, eventId: string, overrides: Record<string, unknown> = {}) {
  await db.collection('events').doc(eventId).set({
    ownerId: 'owner-uid',
    name: 'Evento de prueba',
    date: '2999-01-01',
    location: 'Salón de prueba',
    entryMode: 'open',
    attendeeLimitEnabled: true,
    capacity: 10,
    guestCount: 0,
    peopleCount: 0,
    ...overrides,
  })
}

export async function seedWaitlistEntry(
  db: Firestore,
  eventId: string,
  entryId: string,
  overrides: Record<string, unknown> = {},
) {
  await db.collection('events').doc(eventId).collection('waitlist').doc(entryId).set({
    name: 'Invitado en espera',
    partySize: 1,
    waitlistToken: entryId,
    status: 'waiting',
    priorityBoost: 0,
    createdAt: Date.now(),
    offerToken: null,
    offerExpiresAt: null,
    respondedAt: null,
    promotedGuestId: null,
    promotionReason: null,
    ...overrides,
  })
}

export async function getWaitlistEntry(db: Firestore, eventId: string, entryId: string) {
  const snap = await db.collection('events').doc(eventId).collection('waitlist').doc(entryId).get()
  return snap.data()
}

export async function seedGuest(
  db: Firestore,
  eventId: string,
  guestId: string,
  overrides: Record<string, unknown> = {},
) {
  await db.collection('events').doc(eventId).collection('guests').doc(guestId).set({
    name: 'Invitado de prueba',
    qrToken: `${guestId}-qr`,
    status: 'invited',
    companions: [],
    paymentStatus: 'unpaid',
    paymentMethod: null,
    ...overrides,
  })
}

export async function getGuestDoc(db: Firestore, eventId: string, guestId: string) {
  const snap = await db.collection('events').doc(eventId).collection('guests').doc(guestId).get()
  return snap.data()
}

export async function getGuestContactsDoc(db: Firestore, eventId: string, guestId: string) {
  const snap = await db.collection('events').doc(eventId).collection('guestContacts').doc(guestId).get()
  return snap.data()
}

export async function seedUserProfile(db: Firestore, uid: string, overrides: Record<string, unknown> = {}) {
  await db.collection('users').doc(uid).set({ photoURL: null, ...overrides })
}

export async function seedConcessionItem(
  db: Firestore,
  eventId: string,
  itemId: string,
  overrides: Record<string, unknown> = {},
) {
  await db.collection('events').doc(eventId).collection('concessionsCatalog').doc(itemId).set({
    name: 'Soda italiana',
    category: 'drink',
    priceMinorUnits: 3500,
    currency: 'MXN',
    stockMode: 'unlimited',
    soldCount: 0,
    status: 'active',
    sortOrder: 0,
    ...overrides,
  })
}

export async function getConcessionItemDoc(db: Firestore, eventId: string, itemId: string) {
  const snap = await db.collection('events').doc(eventId).collection('concessionsCatalog').doc(itemId).get()
  return snap.data()
}

export async function seedConcessionOrder(
  db: Firestore,
  eventId: string,
  orderId: string,
  overrides: Record<string, unknown> = {},
) {
  await db.collection('events').doc(eventId).collection('concessionsOrders').doc(orderId).set({
    eventId,
    guestId: 'guest-1',
    guestNameSnapshot: 'Invitado de prueba',
    items: [],
    subtotalMinorUnits: 0,
    totalMinorUnits: 0,
    currency: 'MXN',
    itemCount: 1,
    paymentMethod: 'transfer',
    paymentPhase: 'awaiting_payment',
    ...overrides,
  })
}

export async function getConcessionOrderDoc(db: Firestore, eventId: string, orderId: string) {
  const snap = await db.collection('events').doc(eventId).collection('concessionsOrders').doc(orderId).get()
  return snap.data()
}

export async function seedConcessionFulfillment(
  db: Firestore,
  eventId: string,
  orderId: string,
  overrides: Record<string, unknown> = {},
) {
  await db.collection('events').doc(eventId).collection('concessionsFulfillment').doc(orderId).set({
    eventId,
    guestId: 'guest-1',
    guestNameSnapshot: 'Invitado de prueba',
    orderNumber: 'ABC123',
    lines: [{ nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', quantity: 1 }],
    fulfillmentStatus: 'not_ready',
    ...overrides,
  })
}

export async function getConcessionFulfillmentDoc(db: Firestore, eventId: string, orderId: string) {
  const snap = await db.collection('events').doc(eventId).collection('concessionsFulfillment').doc(orderId).get()
  return snap.data()
}
