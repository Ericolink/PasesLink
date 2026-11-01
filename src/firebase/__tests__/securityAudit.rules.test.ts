import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  updateDoc,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import {
  createTestEnv,
  getEventDoc,
  getGuestDoc,
  seedAdmin,
  seedEvent,
  seedGuest,
  seedGuestContact,
  seedUserProfile,
  seedWaitlistEntry,
  type EmulatorFirestore,
} from './helpers'

// Ataques reales encontrados en la auditoría técnica de PaseLink 2.0
// (hallazgos C1/C2, roadmap P0-1/P0-4), ejecutados directo con el SDK de
// Firestore contra firestore.rules — sin pasar por guests.ts/events.ts, para
// que ningún test pase por un fallo secundario de otra regla (p. ej. el
// batch de contadores de deleteGuest, que hacía que guestSelfCancel.rules.test.ts
// no detectara un `|| true` en el `allow delete` de guests).
//
// Dos tipos de test:
//
// - Barreras que HOY son seguras (assertFails/assertSucceeds normales):
//   tienen que seguir pasando siempre. Si una falla, alguien abrió una regla.
//
// - `KNOWN VULNERABILITY …`: caracterización del estado ACTUAL, todavía
//   vulnerable. Reproducen el ataque y verifican que hoy funciona (con la
//   evidencia concreta: qrTokens/fechas de nacimiento recuperados). Se
//   escriben así y no como assertFails porque test:firebase bloquea los
//   deploys (ver firebase-functions-production-deploy.yml) — un test rojo
//   frenaría todo el pipeline hasta P0-4. Cuando P0-4 corrija las reglas,
//   estos tests van a fallar solos: en ese momento se invierten a
//   assertFails (el comentario de cada uno dice cómo) y pasan a ser barreras.

const EVENT_ID = 'audit-event'
const OWNER_UID = 'owner-uid' // = ownerId de defaultEventData
const STRANGER_UID = 'stranger-uid'
const LEGACY_COORG_UID = 'legacy-coorg-uid'
const COLLAB_ADMIN_UID = 'collab-admin-uid'
const COLLAB_RECEPCION_UID = 'collab-recepcion-uid'
const COLLAB_CAJA_UID = 'collab-caja-uid'

// Coorganizador legacy (coOrganizersMap) + colaboradores del modelo nuevo —
// las dos ramas de isCoOrganizerData en firestore.rules.
const STAFF_EVENT_OVERRIDES = {
  coOrganizersMap: { [LEGACY_COORG_UID]: 'coorg@example.com' },
  collaborators: {
    [COLLAB_ADMIN_UID]: { email: 'admin@example.com', role: 'administrador', invitedBy: OWNER_UID, invitedAt: 1 },
    [COLLAB_RECEPCION_UID]: { email: 'recepcion@example.com', role: 'recepcion', invitedBy: OWNER_UID, invitedAt: 1 },
    [COLLAB_CAJA_UID]: { email: 'caja@example.com', role: 'caja', invitedBy: OWNER_UID, invitedAt: 1 },
  },
}

/**
 * Recorre una colección página por página con orderBy(documentId()) +
 * startAfter + limit(1) — el ataque de enumeración tal cual lo haría un
 * script. Devuelve cada documento alcanzado.
 */
async function crawlWithLimitOne(db: EmulatorFirestore, path: string): Promise<QueryDocumentSnapshot[]> {
  const col = collection(db, path)
  const found: QueryDocumentSnapshot[] = []
  for (let page = 0; page < 50; page++) {
    const cursor = found.at(-1)
    const q = cursor
      ? query(col, orderBy(documentId()), startAfter(cursor), limit(1))
      : query(col, orderBy(documentId()), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) break
    found.push(snap.docs[0])
  }
  return found
}

const fieldOf = (docs: QueryDocumentSnapshot[], field: string) => docs.map((d) => d.data()[field] as string).sort()

describe('auditoría — eliminación de invitados (guests/{guestId} delete)', () => {
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

  const guestRef = (db: EmulatorFirestore) => doc(db, 'events', EVENT_ID, 'guests', 'guest-1')

  it('rejects an unauthenticated deleteDoc on a guest who already checked in', async () => {
    await seedEvent(testEnv, EVENT_ID)
    await seedGuest(testEnv, EVENT_ID, 'guest-1', { status: 'checked_in', rsvpStatus: 'yes' })

    await assertFails(deleteDoc(guestRef(testEnv.unauthenticatedContext().firestore())))
    expect(await getGuestDoc(testEnv, EVENT_ID, 'guest-1')).toBeDefined()
  })

  it('rejects an authenticated stranger deleting a guest who already checked in', async () => {
    await seedEvent(testEnv, EVENT_ID)
    await seedGuest(testEnv, EVENT_ID, 'guest-1', { status: 'checked_in', rsvpStatus: 'yes' })

    await assertFails(deleteDoc(guestRef(testEnv.authenticatedContext(STRANGER_UID).firestore())))
    expect(await getGuestDoc(testEnv, EVENT_ID, 'guest-1')).toBeDefined()
  })

  it.each([
    ['recepcion', COLLAB_RECEPCION_UID],
    ['caja', COLLAB_CAJA_UID],
  ])('rejects a "%s" collaborator (no deleteGuests) deleting a checked-in guest', async (_role, uid) => {
    await seedEvent(testEnv, EVENT_ID, STAFF_EVENT_OVERRIDES)
    await seedGuest(testEnv, EVENT_ID, 'guest-1', { status: 'checked_in', rsvpStatus: 'yes' })

    await assertFails(deleteDoc(guestRef(testEnv.authenticatedContext(uid).firestore())))
  })

  it.each([
    ['owner', OWNER_UID],
    ['legacy co-organizer (default deleteGuests)', LEGACY_COORG_UID],
    ['"administrador" collaborator', COLLAB_ADMIN_UID],
  ])('lets the %s delete a guest, even one who already checked in', async (_who, uid) => {
    await seedEvent(testEnv, EVENT_ID, STAFF_EVENT_OVERRIDES)
    await seedGuest(testEnv, EVENT_ID, 'guest-1', { status: 'checked_in', rsvpStatus: 'yes' })

    await assertSucceeds(deleteDoc(guestRef(testEnv.authenticatedContext(uid).firestore())))
    expect(await getGuestDoc(testEnv, EVENT_ID, 'guest-1')).toBeUndefined()
  })

  it('lets a platform admin (custom claim) delete a guest', async () => {
    await seedEvent(testEnv, EVENT_ID)
    await seedGuest(testEnv, EVENT_ID, 'guest-1', { status: 'checked_in' })

    await assertSucceeds(deleteDoc(guestRef(testEnv.authenticatedContext('admin-1', { admin: true }).firestore())))
  })

  // KNOWN VULNERABILITY C1 (P0-4): la rama de autocancelación
  // (`|| status != 'checked_in'`) no exige sesión ni prueba de que quien
  // borra es el propio invitado, y no necesita tocar los contadores del
  // evento — un deleteDoc suelto alcanza. Al corregir: assertSucceeds →
  // assertFails y `toBeUndefined` → `toBeDefined`.
  describe('KNOWN VULNERABILITY C1 — documents current behavior; flip to assertFails when P0-4 lands', () => {
    it.each([
      ['invited / rsvp pending', { status: 'invited', rsvpStatus: 'pending' }],
      ['invited / rsvp yes', { status: 'invited', rsvpStatus: 'yes' }],
      ['invited / rsvp no', { status: 'invited', rsvpStatus: 'no' }],
    ])('an unauthenticated deleteDoc currently DELETES a guest in state "%s"', async (_state, overrides) => {
      await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 1 })
      await seedGuest(testEnv, EVENT_ID, 'guest-1', overrides)

      await assertSucceeds(deleteDoc(guestRef(testEnv.unauthenticatedContext().firestore())))
      expect(await getGuestDoc(testEnv, EVENT_ID, 'guest-1')).toBeUndefined()
      // Los contadores del evento quedan desfasados: el ataque ni siquiera
      // pasa por guestSelfCancelCountsOk.
      expect((await getEventDoc(testEnv, EVENT_ID))?.guestCount).toBe(1)
    })

    it('an authenticated stranger currently DELETES a guest who has not checked in', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, 'guest-1', { status: 'invited', rsvpStatus: 'yes' })

      await assertSucceeds(deleteDoc(guestRef(testEnv.authenticatedContext(STRANGER_UID).firestore())))
      expect(await getGuestDoc(testEnv, EVENT_ID, 'guest-1')).toBeUndefined()
    })
  })
})

describe('auditoría — enumeración de invitados (guests list)', () => {
  let testEnv: RulesTestEnvironment
  const TOKENS = ['qr-token-a', 'qr-token-b', 'qr-token-c']

  beforeAll(async () => {
    testEnv = await createTestEnv()
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  async function seedThreeGuests() {
    await seedEvent(testEnv, EVENT_ID, STAFF_EVENT_OVERRIDES)
    for (const [i, token] of TOKENS.entries()) {
      await seedGuest(testEnv, EVENT_ID, `guest-${i}`, { qrToken: token })
      await seedGuestContact(testEnv, EVENT_ID, `guest-${i}`, { email: `guest${i}@example.com`, phone: '5550000000' })
    }
  }

  const guestsPath = `events/${EVENT_ID}/guests`

  it('rejects an anonymous list of guests without limit()', async () => {
    await seedThreeGuests()
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDocs(collection(anonDb, guestsPath)))
  })

  it('rejects an anonymous list of guests with limit(2)', async () => {
    await seedThreeGuests()
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDocs(query(collection(anonDb, guestsPath), limit(2))))
  })

  it('rejects an authenticated stranger listing guests without limit()', async () => {
    await seedThreeGuests()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(getDocs(collection(strangerDb, guestsPath)))
  })

  it('rejects a "caja" collaborator (no viewGuestList) listing guests without limit()', async () => {
    await seedThreeGuests()
    const cajaDb = testEnv.authenticatedContext(COLLAB_CAJA_UID).firestore()

    await assertFails(getDocs(collection(cajaDb, guestsPath)))
  })

  it.each([
    ['owner', OWNER_UID],
    ['"recepcion" collaborator (viewGuestList)', COLLAB_RECEPCION_UID],
  ])('lets the %s list the full guest list', async (_who, uid) => {
    await seedThreeGuests()
    const db = testEnv.authenticatedContext(uid).firestore()

    const snap = await assertSucceeds(getDocs(collection(db, guestsPath)))
    expect(snap.size).toBe(TOKENS.length)
  })

  // KNOWN VULNERABILITY C1 (P0-4): `allow list: if request.query.limit <= 1`
  // se pensó para buscar un invitado por qrToken, pero también deja paginar.
  // Al corregir: assertSucceeds → assertFails en el primer paso, y la
  // caminata debe cortar con permission-denied sin recuperar ningún token.
  describe('KNOWN VULNERABILITY C1 — documents current behavior; flip to assertFails when P0-4 lands', () => {
    it('an anonymous limit(1) query currently returns a guest WITH its qrToken', async () => {
      await seedThreeGuests()
      const anonDb = testEnv.unauthenticatedContext().firestore()

      const snap = await assertSucceeds(getDocs(query(collection(anonDb, guestsPath), limit(1))))
      expect(TOKENS).toContain(snap.docs[0].data().qrToken)
    })

    it('anonymous orderBy(documentId()) + startAfter + limit(1) currently recovers EVERY qrToken', async () => {
      await seedThreeGuests()
      const anonDb = testEnv.unauthenticatedContext().firestore()

      const recovered = fieldOf(await crawlWithLimitOne(anonDb, guestsPath), 'qrToken')
      expect(recovered).toEqual([...TOKENS].sort())
    })

    it('the guest ids from the crawl currently unlock every guestContacts doc (email/phone)', async () => {
      await seedThreeGuests()
      const anonDb = testEnv.unauthenticatedContext().firestore()

      const guests = await crawlWithLimitOne(anonDb, guestsPath)
      const emails = await Promise.all(guests.map(async (g) =>
        (await getDoc(doc(anonDb, 'events', EVENT_ID, 'guestContacts', g.id))).data()?.email))
      expect(emails.sort()).toEqual(['guest0@example.com', 'guest1@example.com', 'guest2@example.com'])
    })

    // No es un ataque: es la consulta que la app usa HOY (guests.ts,
    // findGuestRefByToken y la búsqueda del pase). Depende de la misma regla
    // vulnerable — cuando P0-4 la cierre, este test va a fallar también y
    // recuerda migrar esas consultas a la Callable antes de endurecer.
    it('the app\'s current where(qrToken) + limit(1) lookup depends on this same rule', async () => {
      await seedThreeGuests()
      const anonDb = testEnv.unauthenticatedContext().firestore()

      const snap = await assertSucceeds(getDocs(query(collection(anonDb, guestsPath), where('qrToken', '==', 'qr-token-b'), limit(1))))
      expect(snap.docs[0].id).toBe('guest-1')
    })
  })
})

describe('auditoría — enumeración de la lista de espera (waitlist list)', () => {
  let testEnv: RulesTestEnvironment
  const TOKENS = ['wl-token-a', 'wl-token-b', 'wl-token-c']

  beforeAll(async () => {
    testEnv = await createTestEnv()
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  async function seedThreeEntries() {
    await seedEvent(testEnv, EVENT_ID, STAFF_EVENT_OVERRIDES)
    for (const [i, token] of TOKENS.entries()) {
      await seedWaitlistEntry(testEnv, EVENT_ID, `entry-${i}`, { waitlistToken: token })
    }
  }

  const waitlistPath = `events/${EVENT_ID}/waitlist`

  it('rejects an anonymous list of the waitlist without limit()', async () => {
    await seedThreeEntries()
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDocs(collection(anonDb, waitlistPath)))
  })

  it('rejects an anonymous list of the waitlist with limit(2)', async () => {
    await seedThreeEntries()
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDocs(query(collection(anonDb, waitlistPath), limit(2))))
  })

  it('rejects an authenticated stranger listing the waitlist without limit()', async () => {
    await seedThreeEntries()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(getDocs(collection(strangerDb, waitlistPath)))
  })

  it.each([
    ['owner', OWNER_UID],
    ['"recepcion" collaborator (viewGuestList)', COLLAB_RECEPCION_UID],
  ])('lets the %s list the full waitlist (WaitlistPanel)', async (_who, uid) => {
    await seedThreeEntries()
    const db = testEnv.authenticatedContext(uid).firestore()

    const snap = await assertSucceeds(getDocs(collection(db, waitlistPath)))
    expect(snap.size).toBe(TOKENS.length)
  })

  // KNOWN VULNERABILITY C1 (P0-4): mismo patrón `limit <= 1` que guests.
  describe('KNOWN VULNERABILITY C1 — documents current behavior; flip to assertFails when P0-4 lands', () => {
    it('anonymous orderBy(documentId()) + startAfter + limit(1) currently recovers EVERY waitlistToken', async () => {
      await seedThreeEntries()
      const anonDb = testEnv.unauthenticatedContext().firestore()

      const recovered = fieldOf(await crawlWithLimitOne(anonDb, waitlistPath), 'waitlistToken')
      expect(recovered).toEqual([...TOKENS].sort())
    })
  })
})

describe('auditoría — enumeración de usuarios (users list)', () => {
  let testEnv: RulesTestEnvironment
  const USER_UIDS = ['user-a', 'user-b', 'user-c']

  beforeAll(async () => {
    testEnv = await createTestEnv()
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  async function seedThreeUsers() {
    for (const [i, uid] of USER_UIDS.entries()) {
      await seedUserProfile(testEnv, uid, { birthDate: `199${i}-01-01`, fcmTokens: [`fcm-${uid}`] })
    }
  }

  it('rejects an anonymous limit(1) query on users', async () => {
    await seedThreeUsers()
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDocs(query(collection(anonDb, 'users'), limit(1))))
  })

  it('rejects an anonymous list of users without limit()', async () => {
    await seedThreeUsers()
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(getDocs(collection(anonDb, 'users')))
  })

  // Hallazgo C2, corregido en P0-3 (`allow list: if isAdmin()`). Antes
  // `request.auth != null && limit <= 1` dejaba a cualquier sesión traer un
  // perfil completo con limit(1) y paginar la colección entera.
  it('rejects an authenticated non-admin limit(1) query on users (C2)', async () => {
    await seedThreeUsers()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(getDocs(query(collection(strangerDb, 'users'), limit(1))))
  })

  it('rejects an authenticated non-admin paginating users with orderBy(documentId()) + startAfter + limit(1) (C2)', async () => {
    await seedThreeUsers()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(crawlWithLimitOne(strangerDb, 'users'))
  })

  // La consulta exacta de getUserByEmail (src/firebase/userProfile.ts, hoy
  // sin llamadas) — el motivo histórico de la rama `limit <= 1`.
  it('rejects an authenticated non-admin looking up a user by email with limit(1) (C2)', async () => {
    await seedThreeUsers()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(getDocs(query(collection(strangerDb, 'users'), where('email', '==', 'user-a@test.com'), limit(1))))
  })

  it('rejects an authenticated non-admin counting users with getCountFromServer', async () => {
    await seedThreeUsers()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(getCountFromServer(collection(strangerDb, 'users')))
  })

  it('rejects an authenticated non-admin listing users without limit()', async () => {
    await seedThreeUsers()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(getDocs(collection(strangerDb, 'users')))
  })

  it('rejects an authenticated non-admin listing users with limit(2)', async () => {
    await seedThreeUsers()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(getDocs(query(collection(strangerDb, 'users'), limit(2))))
  })

  it('rejects an authenticated non-admin reading another user\'s doc by id', async () => {
    await seedThreeUsers()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(getDoc(doc(strangerDb, 'users', 'user-a')))
  })

  it('lets a user read their own doc', async () => {
    await seedThreeUsers()
    const ownDb = testEnv.authenticatedContext('user-a').firestore()

    await assertSucceeds(getDoc(doc(ownDb, 'users', 'user-a')))
  })

  it('lets an admin (custom claim) list every user (AdminDashboard)', async () => {
    await seedThreeUsers()
    const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

    const snap = await assertSucceeds(getDocs(collection(adminDb, 'users')))
    expect(snap.size).toBe(USER_UIDS.length)
  })

  it('lets an admin from the transitional admins/{uid} doc list every user', async () => {
    await seedThreeUsers()
    await seedAdmin(testEnv, 'legacy-admin')
    const adminDb = testEnv.authenticatedContext('legacy-admin').firestore()

    await assertSucceeds(getDocs(collection(adminDb, 'users')))
  })

  // Las otras dos lecturas reales del panel de admin: subscribeToRecentUsers
  // (adminActivity.ts) y los conteos de getUserStats/getFunnelStats.
  it('lets an admin run the recent-users query and the user counts (ControlCenter)', async () => {
    await seedThreeUsers()
    const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

    await assertSucceeds(getDocs(query(collection(adminDb, 'users'), orderBy('createdAt', 'desc'), limit(15))))
    const count = await assertSucceeds(getCountFromServer(collection(adminDb, 'users')))
    expect(count.data().count).toBe(USER_UIDS.length)
  })

  // Operaciones de perfil propio — `allow write` no cambió en P0-3; estos
  // tests confirman que restringir `list` no las afectó.
  it('lets a user update their own profile (photoURL, fcmTokens)', async () => {
    await seedThreeUsers()
    const ownDb = testEnv.authenticatedContext('user-a').firestore()

    await assertSucceeds(setDoc(doc(ownDb, 'users', 'user-a'), { photoURL: 'https://example.com/a.jpg' }, { merge: true }))
    await assertSucceeds(updateDoc(doc(ownDb, 'users', 'user-a'), { fcmTokens: arrayUnion('fcm-new') }))
  })

  it('rejects a user writing another user\'s profile', async () => {
    await seedThreeUsers()
    const strangerDb = testEnv.authenticatedContext(STRANGER_UID).firestore()

    await assertFails(setDoc(doc(strangerDb, 'users', 'user-a'), { photoURL: 'https://example.com/x.jpg' }, { merge: true }))
  })
})

describe('auditoría — eliminación de eventos (events/{eventId} delete)', () => {
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

  const eventRef = (db: EmulatorFirestore) => doc(db, 'events', EVENT_ID)

  it('rejects an unauthenticated deleteDoc on an event', async () => {
    await seedEvent(testEnv, EVENT_ID)

    await assertFails(deleteDoc(eventRef(testEnv.unauthenticatedContext().firestore())))
    expect(await getEventDoc(testEnv, EVENT_ID)).toBeDefined()
  })

  it('rejects an authenticated stranger deleting an event', async () => {
    await seedEvent(testEnv, EVENT_ID)

    await assertFails(deleteDoc(eventRef(testEnv.authenticatedContext(STRANGER_UID).firestore())))
    expect(await getEventDoc(testEnv, EVENT_ID)).toBeDefined()
  })

  // Solo el dueño (o un admin de plataforma) borra el evento — ningún
  // coorganizador/colaborador, ni siquiera "administrador".
  it.each([
    ['legacy co-organizer', LEGACY_COORG_UID],
    ['"administrador" collaborator', COLLAB_ADMIN_UID],
    ['"recepcion" collaborator', COLLAB_RECEPCION_UID],
  ])('rejects a %s deleting the event', async (_who, uid) => {
    await seedEvent(testEnv, EVENT_ID, STAFF_EVENT_OVERRIDES)

    await assertFails(deleteDoc(eventRef(testEnv.authenticatedContext(uid).firestore())))
    expect(await getEventDoc(testEnv, EVENT_ID)).toBeDefined()
  })

  it('lets the owner delete their own event', async () => {
    await seedEvent(testEnv, EVENT_ID, STAFF_EVENT_OVERRIDES)

    await assertSucceeds(deleteDoc(eventRef(testEnv.authenticatedContext(OWNER_UID).firestore())))
    expect(await getEventDoc(testEnv, EVENT_ID)).toBeUndefined()
  })

  it('lets a platform admin (custom claim) delete an event', async () => {
    await seedEvent(testEnv, EVENT_ID)

    await assertSucceeds(deleteDoc(eventRef(testEnv.authenticatedContext('admin-1', { admin: true }).firestore())))
  })

  it('lets an admin from the transitional admins/{uid} doc delete an event', async () => {
    await seedEvent(testEnv, EVENT_ID)
    await seedAdmin(testEnv, 'legacy-admin')

    await assertSucceeds(deleteDoc(eventRef(testEnv.authenticatedContext('legacy-admin').firestore())))
  })
})
