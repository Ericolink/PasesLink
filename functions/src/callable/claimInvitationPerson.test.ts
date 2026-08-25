import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { claimInvitationPerson } from './claimInvitationPerson.js'

const OWNER_UID = 'owner-uid'

describe('claimInvitationPerson (Callable)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', {})

    await expect(
      claimInvitationPerson.run(fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 0 })),
    ).rejects.toThrow(HttpsError)
  })

  it('lets a logged-in account claim the principal guest (index 0)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { companions: [{ name: 'Ana', lastName: 'García' }] })

    const result = await claimInvitationPerson.run(
      fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 0 }, 'eric-uid'),
    )

    expect(result).toEqual({ ok: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.guestUid).toBe('eric-uid')
  })

  it('lets a different account claim a companion (index >= 1) without touching guestUid', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', {
      guestUid: 'eric-uid',
      companions: [{ name: 'Ana', lastName: 'García' }, { name: 'Carlos', lastName: 'López' }],
    })

    const result = await claimInvitationPerson.run(
      fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 1 }, 'ana-uid'),
    )

    expect(result).toEqual({ ok: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.guestUid).toBe('eric-uid')
    expect(guest?.companionClaims).toEqual({ '1': 'ana-uid' })
  })

  it('is idempotent when the same account claims the same person twice', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { companions: [{ name: 'Ana', lastName: 'García' }] })

    await claimInvitationPerson.run(fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 1 }, 'ana-uid'))
    const result = await claimInvitationPerson.run(
      fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 1 }, 'ana-uid'),
    )

    expect(result).toEqual({ ok: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.companionClaims).toEqual({ '1': 'ana-uid' })
  })

  it('rejects claiming a person already claimed by a different account (no overwrite)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', {
      companions: [{ name: 'Ana', lastName: 'García' }],
      companionClaims: { '1': 'ana-uid' },
    })

    await expect(
      claimInvitationPerson.run(fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 1 }, 'intruder-uid')),
    ).rejects.toThrow(HttpsError)
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.companionClaims).toEqual({ '1': 'ana-uid' })
  })

  it('lets the same account hold multiple claims in the same invitation (e.g. a parent claiming for their kids)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', {
      companions: [{ name: 'Carlos', lastName: 'Muñoz' }, { name: 'María', lastName: 'García' }],
    })

    await claimInvitationPerson.run(fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 1 }, 'parent-uid'))
    await claimInvitationPerson.run(fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 2 }, 'parent-uid'))

    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.companionClaims).toEqual({ '1': 'parent-uid', '2': 'parent-uid' })
  })

  it('rejects an index beyond the companions count', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { companions: [{ name: 'Ana', lastName: 'García' }] })

    await expect(
      claimInvitationPerson.run(fakeCallableRequest({ eventId, guestId: 'guest-1', personIndex: 5 }, 'someone-uid')),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a guest that does not exist', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      claimInvitationPerson.run(fakeCallableRequest({ eventId, guestId: 'missing', personIndex: 0 }, 'someone-uid')),
    ).rejects.toThrow(HttpsError)
  })
})
