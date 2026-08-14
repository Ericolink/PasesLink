import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedUserProfile, uniqueId } from '../__tests__/helpers.js'
import { resolveLinkCreator } from './resolveLinkCreator.js'

describe('resolveLinkCreator', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('falls back to the owner when there is no ref uid', async () => {
    const eventId = uniqueId('event')
    const ownerId = uniqueId('owner')
    await seedEvent(db, eventId, { ownerId })
    await seedUserProfile(db, ownerId, { displayName: 'Eric Muñoz' })

    const eventSnap = await db.collection('events').doc(eventId).get()
    const creator = await resolveLinkCreator(db, eventSnap.data()!, null)

    expect(creator).toEqual({ displayName: 'Eric Muñoz', isOwner: true })
  })

  it('uses the collaborator name when the ref uid has shareInviteLink permission', async () => {
    const eventId = uniqueId('event')
    const ownerId = uniqueId('owner')
    const collaboratorUid = uniqueId('collab')
    // Solo 'administrador' (acceso completo) trae shareInviteLink entre los
    // roles de collaborators — el mismo permiso que gatea el botón
    // "Compartir evento" en EventDetail.tsx (perms.shareInviteLink); roles
    // acotados como 'recepcion'/'preparacion' no lo tienen (ver
    // functions/src/lib/permissions.ts ROLE_PRESETS).
    await seedEvent(db, eventId, {
      ownerId,
      collaborators: { [collaboratorUid]: { role: 'administrador' } },
    })
    await seedUserProfile(db, ownerId, { displayName: 'Eric Muñoz' })
    await seedUserProfile(db, collaboratorUid, { displayName: 'Carlos López' })

    const eventSnap = await db.collection('events').doc(eventId).get()
    const creator = await resolveLinkCreator(db, eventSnap.data()!, collaboratorUid)

    expect(creator).toEqual({ displayName: 'Carlos López', isOwner: false })
  })

  it('falls back to the owner when the ref uid has no relation to the event', async () => {
    const eventId = uniqueId('event')
    const ownerId = uniqueId('owner')
    const strangerUid = uniqueId('stranger')
    await seedEvent(db, eventId, { ownerId })
    await seedUserProfile(db, ownerId, { displayName: 'Eric Muñoz' })
    await seedUserProfile(db, strangerUid, { displayName: 'No Debería Aparecer' })

    const eventSnap = await db.collection('events').doc(eventId).get()
    const creator = await resolveLinkCreator(db, eventSnap.data()!, strangerUid)

    expect(creator.displayName).toBe('Eric Muñoz')
    expect(creator.isOwner).toBe(true)
  })

  it('falls back to the owner when the ref uid has a role without shareInviteLink (e.g. preparación)', async () => {
    const eventId = uniqueId('event')
    const ownerId = uniqueId('owner')
    const prepUid = uniqueId('prep')
    await seedEvent(db, eventId, {
      ownerId,
      collaborators: { [prepUid]: { role: 'preparacion' } },
    })
    await seedUserProfile(db, ownerId, { displayName: 'Eric Muñoz' })
    await seedUserProfile(db, prepUid, { displayName: 'Staff de Cocina' })

    const eventSnap = await db.collection('events').doc(eventId).get()
    const creator = await resolveLinkCreator(db, eventSnap.data()!, prepUid)

    expect(creator.displayName).toBe('Eric Muñoz')
  })

  it('falls back to a generic label when the owner has no profile at all', async () => {
    const eventId = uniqueId('event')
    const ownerId = uniqueId('owner')
    await seedEvent(db, eventId, { ownerId })

    const eventSnap = await db.collection('events').doc(eventId).get()
    const creator = await resolveLinkCreator(db, eventSnap.data()!, null)

    expect(creator).toEqual({ displayName: 'El organizador', isOwner: true })
  })

  it('uses the email as a fallback when the collaborator profile has no displayName', async () => {
    const eventId = uniqueId('event')
    const ownerId = uniqueId('owner')
    const collaboratorUid = uniqueId('collab')
    await seedEvent(db, eventId, {
      ownerId,
      collaborators: { [collaboratorUid]: { role: 'administrador' } },
    })
    await seedUserProfile(db, ownerId, { displayName: 'Eric Muñoz' })
    await seedUserProfile(db, collaboratorUid, { email: 'carlos@example.com' })

    const eventSnap = await db.collection('events').doc(eventId).get()
    const creator = await resolveLinkCreator(db, eventSnap.data()!, collaboratorUid)

    expect(creator.displayName).toBe('carlos@example.com')
  })
})
