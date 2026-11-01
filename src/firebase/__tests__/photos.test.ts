import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import { createTestEnv, seedEvent, type EmulatorFirestore } from './helpers'
import { hashGuestQrToken } from '../../utils/photoAuthor'

// Mismo mock que guests.test.ts/capacity.test.ts: redirige el `db` singleton
// de photos.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { addPhoto, pinPhoto, reactToPhoto, replyToPhoto } from '../photos'

const OWNER_UID = 'owner-uid'
const OTHER_UID = 'someone-else-uid'
const EVENT_ID = 'event-1'
const PHOTO_ID = 'photo-1'

async function seedPhoto(testEnv: RulesTestEnvironment, overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'events', EVENT_ID, 'photos', PHOTO_ID), {
      url: 'https://res.cloudinary.com/demo/image/upload/photo.jpg',
      authorName: 'Invitado de prueba',
      authorToken: 'guest-token',
      caption: '',
      pinned: false,
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

async function getPhotoDoc(testEnv: RulesTestEnvironment) {
  let result: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'events', EVENT_ID, 'photos', PHOTO_ID))
    result = snap.data()
  })
  return result
}

describe('photos.ts — pinPhoto', () => {
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

  it('lets the event owner pin a photo', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv)
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await expect(pinPhoto(EVENT_ID, PHOTO_ID, false)).resolves.toBeUndefined()

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.pinned).toBe(true)
  })

  it('lets the owner unpin a photo that was already pinned', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv, { pinned: true })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await pinPhoto(EVENT_ID, PHOTO_ID, true)

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.pinned).toBe(false)
  })

  it('rejects pinning from a user who is neither owner nor co-organizer', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv)
    dbHolder.db = testEnv.authenticatedContext(OTHER_UID).firestore()

    await expect(pinPhoto(EVENT_ID, PHOTO_ID, false)).rejects.toThrow()

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.pinned).toBe(false)
  })
})

// `seedPhoto` (arriba) nunca escribe reactionCount/reactionCountsByType — a
// propósito, simula exactamente la forma de una foto subida ANTES de esta
// feature (ver comentario en isValidWallReplyAppend, firestore.rules). Estos
// tests verifican que reaccionar/responder funciona igual sobre esas fotos
// "legacy" sin backfill, no solo sobre fotos nuevas.
describe('photos.ts — reactToPhoto', () => {
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

  async function seedReaction(token: string, type: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'events', EVENT_ID, 'photos', PHOTO_ID, 'reactions', token), {
        type,
        name: 'Invitado',
        reactedAt: Date.now(),
      })
    })
  }

  it('lets an unauthenticated guest react to a legacy photo with no reaction fields, writing a mirror doc to the subcollection', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv)
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(reactToPhoto(EVENT_ID, PHOTO_ID, 'device-token-1', 'Invitado', 'love')).resolves.toBeUndefined()

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.reactionCount).toBe(1)
    expect(photo?.reactionCountsByType).toEqual({ love: 1 })

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const reactionSnap = await getDoc(doc(context.firestore(), 'events', EVENT_ID, 'photos', PHOTO_ID, 'reactions', 'device-token-1'))
      expect(reactionSnap.exists()).toBe(true)
      expect(reactionSnap.data()?.type).toBe('love')
    })
  })

  it('lets the same reactor change their reaction, moving the count between types', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv, { reactionCount: 1, reactionCountsByType: { like: 1 } })
    await seedReaction('device-token-1', 'like')
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await reactToPhoto(EVENT_ID, PHOTO_ID, 'device-token-1', 'Invitado', 'haha')

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.reactionCount).toBe(1)
    expect(photo?.reactionCountsByType).toEqual({ like: 0, haha: 1 })

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const reactionSnap = await getDoc(doc(context.firestore(), 'events', EVENT_ID, 'photos', PHOTO_ID, 'reactions', 'device-token-1'))
      expect(reactionSnap.data()?.type).toBe('haha')
    })
  })

  it('removes a reaction when reactionType is null', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv, { reactionCount: 1, reactionCountsByType: { like: 1 } })
    await seedReaction('device-token-1', 'like')
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await reactToPhoto(EVENT_ID, PHOTO_ID, 'device-token-1', 'Invitado', null)

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.reactionCount).toBe(0)
    expect(photo?.reactionCountsByType).toEqual({ like: 0 })

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const reactionSnap = await getDoc(doc(context.firestore(), 'events', EVENT_ID, 'photos', PHOTO_ID, 'reactions', 'device-token-1'))
      expect(reactionSnap.exists()).toBe(false)
    })
  })

  // Auditoría F2/F11: el mapa `reactions{}` embebido (blanco del abuso de
  // F12 — inyectar muchas claves de golpe) ya no forma parte del documento
  // en absoluto — escribirlo directo queda rechazado sin excepción, no solo
  // acotado como antes (ver isSingleReactionKeyChange, retirada de
  // firestore.rules).
  it('rejects a direct write to the legacy reactions field', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv)
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(
      setDoc(doc(dbHolder.db, 'events', EVENT_ID, 'photos', PHOTO_ID), {
        reactions: { 'device-token-1': { type: 'like', name: 'Invitado' } },
      }, { merge: true }),
    ).rejects.toThrow()
  })

  // Auditoría F2/F11 — mismo mecanismo probado a fondo en wall.test.ts
  // (motor compartido, ver interactions.ts).
  it('rejects a direct write that jumps reactionCount by more than 1 in a single request', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv)
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(
      setDoc(doc(dbHolder.db, 'events', EVENT_ID, 'photos', PHOTO_ID), { reactionCount: 500 }, { merge: true }),
    ).rejects.toThrow()
  })
})

describe('photos.ts — replyToPhoto', () => {
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

  it('lets an unauthenticated guest reply to a legacy photo with no replies field', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv)
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const reply = await replyToPhoto(EVENT_ID, PHOTO_ID, '¡Qué linda foto!', 'Invitado', 'guest-token-2')
    expect(reply.text).toBe('¡Qué linda foto!')

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.replies).toHaveLength(1)
    expect((photo?.replies as { text: string }[])[0].text).toBe('¡Qué linda foto!')
  })

  it('appends to existing replies without touching them', async () => {
    const existingReply = { id: 'r1', text: 'primera', authorName: 'A', authorToken: 't1', authorRole: 'guest', createdAt: 1 }
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv, { replies: [existingReply] })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await replyToPhoto(EVENT_ID, PHOTO_ID, 'segunda', 'B', 'guest-token-3')

    const photo = await getPhotoDoc(testEnv)
    const replies = photo?.replies as { text: string }[]
    expect(replies).toHaveLength(2)
    expect(replies[0].text).toBe('primera')
    expect(replies[1].text).toBe('segunda')
  })

  it('rejects a direct write that rewrites an existing reply instead of appending', async () => {
    const existingReply = { id: 'r1', text: 'primera', authorName: 'A', authorToken: 't1', authorRole: 'guest', createdAt: 1 }
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv, { replies: [existingReply] })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(
      setDoc(doc(dbHolder.db, 'events', EVENT_ID, 'photos', PHOTO_ID), { replies: [{ ...existingReply, text: 'tampered' }] }, { merge: true }),
    ).rejects.toThrow()
  })
})

// T4 de P0-4 (hallazgo N2): photos es de lectura pública, así que una foto
// subida desde el pase nunca puede guardar el qrToken del invitado — se
// guarda SHA-256(qrToken). Escritura real con el SDK y las reglas.
describe('photos.ts — addPhoto nunca guarda el qrToken original', () => {
  let testEnv: RulesTestEnvironment
  const QR_TOKEN_ANA = '0f1e2d3c4b5a69788796a5b4c3d2e1f0'
  const QR_TOKEN_BETO = 'aaaabbbbccccddddeeeeffff00001111'
  const PHOTO = { url: 'https://res.cloudinary.com/demo/image/upload/nueva.jpg', authorName: 'Ana Prueba', caption: 'Hola' }

  beforeAll(async () => {
    testEnv = await createTestEnv()
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  async function allPhotoDocs() {
    let result: Record<string, unknown>[] = []
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snap = await getDocs(collection(context.firestore(), 'events', EVENT_ID, 'photos'))
      result = snap.docs.map((d) => d.data())
    })
    return result
  }

  it('stores SHA-256(qrToken) — not the token — for a guest uploading from their pass', async () => {
    await seedEvent(testEnv, EVENT_ID)
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const photoId = await addPhoto(EVENT_ID, PHOTO, { kind: 'guestPass', qrToken: QR_TOKEN_ANA })

    const [stored] = await allPhotoDocs()
    expect(photoId).toBeTruthy()
    expect(stored.authorToken).toBe(await hashGuestQrToken(QR_TOKEN_ANA))
    // Ningún campo del documento contiene el token original.
    expect(JSON.stringify(stored)).not.toContain(QR_TOKEN_ANA)
  })

  it('gives two photos from the same guest the same authorToken, and different guests different ones', async () => {
    await seedEvent(testEnv, EVENT_ID)
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await addPhoto(EVENT_ID, PHOTO, { kind: 'guestPass', qrToken: QR_TOKEN_ANA })
    await addPhoto(EVENT_ID, PHOTO, { kind: 'guestPass', qrToken: QR_TOKEN_ANA })
    await addPhoto(EVENT_ID, { ...PHOTO, authorName: 'Beto Prueba' }, { kind: 'guestPass', qrToken: QR_TOKEN_BETO })

    const tokens = (await allPhotoDocs()).map((p) => p.authorToken as string)
    const hashAna = await hashGuestQrToken(QR_TOKEN_ANA)
    const hashBeto = await hashGuestQrToken(QR_TOKEN_BETO)
    expect(tokens.filter((t) => t === hashAna)).toHaveLength(2)
    expect(tokens.filter((t) => t === hashBeto)).toHaveLength(1)
    expect(tokens).not.toContain(QR_TOKEN_ANA)
    expect(tokens).not.toContain(QR_TOKEN_BETO)
  })

  it('keeps a signed-in author\'s uid as-is (moderation resolves the author by uid)', async () => {
    await seedEvent(testEnv, EVENT_ID)
    dbHolder.db = testEnv.authenticatedContext(OTHER_UID).firestore()

    await addPhoto(EVENT_ID, PHOTO, { kind: 'public', token: OTHER_UID })

    const [stored] = await allPhotoDocs()
    expect(stored.authorToken).toBe(OTHER_UID)
  })
})
