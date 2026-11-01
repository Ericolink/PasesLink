import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { deleteApp, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore'
// @ts-expect-error -- módulo .mjs sin tipos (scripts/ no está en el proyecto de TypeScript)
import { backfillPhotoAuthorTokens, hashQrToken } from '../../../scripts/lib/photoAuthorTokenBackfill.mjs'
import { hashGuestQrToken } from '../../utils/photoAuthor'

// Backfill de photos.authorToken (T4 de P0-4, hallazgo N2) contra el
// emulador con el Admin SDK — el mismo SDK que usa el script real. Todos los
// datos son ficticios. Cada test arranca con Firestore vacío.
interface BackfillStats {
  eventsScanned: number
  photosScanned: number
  migrated: number
  alreadyHashed: number
  empty: number
  notApplicable: number
  pending: string[]
  failed: string[]
}
const runBackfill = backfillPhotoAuthorTokens as (db: Firestore, options: { dryRun: boolean; pageSize?: number }) => Promise<BackfillStats>
const nodeHash = hashQrToken as (token: string) => string

const PROJECT_ID = `demo-paselink-backfill-${Date.now()}`
const TOKEN_ANA = '0f1e2d3c4b5a69788796a5b4c3d2e1f0'
const TOKEN_BETO = 'aaaabbbbccccddddeeeeffff00001111'
const TOKEN_DELETED_GUEST = '1234567890abcdef1234567890abcdef'
const TOKEN_OTHER_EVENT = 'fedcba0987654321fedcba0987654321'

let app: App
let db: Firestore

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Este test necesita el emulador (npm run test:firebase).')
  app = initializeApp({ projectId: PROJECT_ID }, PROJECT_ID)
  db = getFirestore(app)
})

afterEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' })
})

afterAll(async () => {
  await deleteApp(app)
})

async function seedGuest(eventId: string, guestId: string, qrToken: string) {
  await db.doc(`events/${eventId}/guests/${guestId}`).set({ name: guestId, qrToken, status: 'invited' })
}

function photoFields(authorToken: string | undefined, extra: Record<string, unknown> = {}) {
  return {
    url: 'https://res.cloudinary.com/demo/image/upload/foto.jpg',
    authorName: 'Invitado de prueba',
    ...(authorToken === undefined ? {} : { authorToken }),
    caption: 'Una foto',
    width: 1080,
    height: 1350,
    pinned: true,
    reactionCount: 3,
    reactionCountsByType: { love: 2, haha: 1 },
    replies: [{ id: 'r1', text: 'Qué bonita', authorName: 'Beto', authorToken: 'beto-uid', createdAt: 1 }],
    createdAt: Timestamp.fromMillis(1_700_000_000_000),
    ...extra,
  }
}

async function seedPhoto(eventId: string, photoId: string, authorToken: string | undefined) {
  await db.doc(`events/${eventId}/photos/${photoId}`).set(photoFields(authorToken))
}

async function photoSnap(eventId: string, photoId: string) {
  return db.doc(`events/${eventId}/photos/${photoId}`).get()
}

describe('hash consistente entre el cliente (Web Crypto) y el backfill (node:crypto)', () => {
  it('produces the same SHA-256 in both implementations', async () => {
    for (const token of [TOKEN_ANA, TOKEN_BETO, 'abc']) {
      expect(nodeHash(token)).toBe(await hashGuestQrToken(token))
    }
  })
})

describe('backfillPhotoAuthorTokens', () => {
  it('replaces a real guest\'s qrToken with its SHA-256', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedPhoto('ev1', 'p1', TOKEN_ANA)

    const stats = await runBackfill(db, { dryRun: false })

    expect(stats.migrated).toBe(1)
    expect((await photoSnap('ev1', 'p1')).get('authorToken')).toBe(nodeHash(TOKEN_ANA))
  })

  it('changes only authorToken — every other field stays byte-for-byte the same', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedPhoto('ev1', 'p1', TOKEN_ANA)
    const before = (await photoSnap('ev1', 'p1')).data()!

    await runBackfill(db, { dryRun: false })

    const after = (await photoSnap('ev1', 'p1')).data()!
    const { authorToken: tokenBefore, ...restBefore } = before
    const { authorToken: tokenAfter, ...restAfter } = after
    expect(tokenBefore).toBe(TOKEN_ANA)
    expect(tokenAfter).toBe(nodeHash(TOKEN_ANA))
    expect(restAfter).toEqual(restBefore)
    expect((restAfter.createdAt as Timestamp).isEqual(restBefore.createdAt as Timestamp)).toBe(true)
  })

  it('gives the same hash to two photos of the same guest and different hashes to different guests', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedGuest('ev1', 'beto', TOKEN_BETO)
    await seedPhoto('ev1', 'p1', TOKEN_ANA)
    await seedPhoto('ev1', 'p2', TOKEN_ANA)
    await seedPhoto('ev1', 'p3', TOKEN_BETO)

    await runBackfill(db, { dryRun: false })

    const [p1, p2, p3] = await Promise.all(['p1', 'p2', 'p3'].map((id) => photoSnap('ev1', id)))
    expect(p1.get('authorToken')).toBe(p2.get('authorToken'))
    expect(p1.get('authorToken')).not.toBe(p3.get('authorToken'))
  })

  it('leaves already-migrated photos untouched (no write at all)', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedPhoto('ev1', 'p1', nodeHash(TOKEN_ANA))
    const before = await photoSnap('ev1', 'p1')

    const stats = await runBackfill(db, { dryRun: false })

    const after = await photoSnap('ev1', 'p1')
    expect(stats.alreadyHashed).toBe(1)
    expect(stats.migrated).toBe(0)
    expect(after.updateTime!.isEqual(before.updateTime!)).toBe(true)
  })

  it('skips and reports a token-shaped value with no matching guest — never invents a hash', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedPhoto('ev1', 'p1', TOKEN_DELETED_GUEST)

    const stats = await runBackfill(db, { dryRun: false })

    expect(stats.pending).toEqual(['events/ev1/photos/p1'])
    expect(stats.migrated).toBe(0)
    expect((await photoSnap('ev1', 'p1')).get('authorToken')).toBe(TOKEN_DELETED_GUEST)
  })

  it('does not accept a guest from ANOTHER event as proof (the token must belong to the photo\'s event)', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await db.doc('events/ev2').set({ name: 'Evento 2' })
    await seedGuest('ev2', 'carla', TOKEN_OTHER_EVENT)
    await seedPhoto('ev1', 'p1', TOKEN_OTHER_EVENT)

    const stats = await runBackfill(db, { dryRun: false })

    expect(stats.pending).toEqual(['events/ev1/photos/p1'])
    expect((await photoSnap('ev1', 'p1')).get('authorToken')).toBe(TOKEN_OTHER_EVENT)
  })

  it('leaves uids, names, \'owner\' and missing/empty authorTokens untouched', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedPhoto('ev1', 'uid', 'Xy12abcDEF34ghiJKL56mnoPQR78')
    await seedPhoto('ev1', 'name', 'Ana Prueba')
    await seedPhoto('ev1', 'owner', 'owner')
    await seedPhoto('ev1', 'empty', '')
    await seedPhoto('ev1', 'missing', undefined)

    const stats = await runBackfill(db, { dryRun: false })

    expect(stats.notApplicable).toBe(3)
    expect(stats.empty).toBe(2)
    expect(stats.migrated).toBe(0)
    expect(stats.pending).toEqual([])
    expect((await photoSnap('ev1', 'uid')).get('authorToken')).toBe('Xy12abcDEF34ghiJKL56mnoPQR78')
    expect((await photoSnap('ev1', 'name')).get('authorToken')).toBe('Ana Prueba')
    expect((await photoSnap('ev1', 'missing')).get('authorToken')).toBeUndefined()
  })

  it('dry-run reports what it would migrate but writes nothing', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedPhoto('ev1', 'p1', TOKEN_ANA)
    const before = await photoSnap('ev1', 'p1')

    const stats = await runBackfill(db, { dryRun: true })

    const after = await photoSnap('ev1', 'p1')
    expect(stats.migrated).toBe(1)
    expect(after.get('authorToken')).toBe(TOKEN_ANA)
    expect(after.updateTime!.isEqual(before.updateTime!)).toBe(true)
  })

  it('is idempotent: a second run changes nothing', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedPhoto('ev1', 'p1', TOKEN_ANA)
    await seedPhoto('ev1', 'p2', TOKEN_DELETED_GUEST)

    const first = await runBackfill(db, { dryRun: false })
    const afterFirst = await photoSnap('ev1', 'p1')
    const second = await runBackfill(db, { dryRun: false })
    const afterSecond = await photoSnap('ev1', 'p1')

    expect(first.migrated).toBe(1)
    expect(second.migrated).toBe(0)
    expect(second.alreadyHashed).toBe(1)
    expect(second.pending).toEqual(['events/ev1/photos/p2'])
    expect(afterSecond.updateTime!.isEqual(afterFirst.updateTime!)).toBe(true)
  })

  it('processes every event, photo and guest across several pages', async () => {
    for (const eventId of ['ev1', 'ev2', 'ev3']) {
      await db.doc(`events/${eventId}`).set({ name: eventId })
      for (let i = 0; i < 5; i++) {
        const token = nodeHash(`${eventId}-${i}`).slice(0, 32)
        await seedGuest(eventId, `g${i}`, token)
        await seedPhoto(eventId, `p${i}`, token)
      }
    }

    const stats = await runBackfill(db, { dryRun: false, pageSize: 2 })

    expect(stats.eventsScanned).toBe(3)
    expect(stats.photosScanned).toBe(15)
    expect(stats.migrated).toBe(15)
    expect(stats.failed).toEqual([])
  })

  it('never prints a token or a hash in its log output', async () => {
    await db.doc('events/ev1').set({ name: 'Evento 1' })
    await seedGuest('ev1', 'ana', TOKEN_ANA)
    await seedPhoto('ev1', 'p1', TOKEN_ANA)
    await seedPhoto('ev1', 'p2', TOKEN_DELETED_GUEST)
    const lines: string[] = []

    await (backfillPhotoAuthorTokens as (db: Firestore, o: { dryRun: boolean; log: (m: string) => void }) => Promise<BackfillStats>)(
      db, { dryRun: false, log: (m) => lines.push(m) },
    )

    const output = lines.join('\n')
    for (const secret of [TOKEN_ANA, TOKEN_DELETED_GUEST, nodeHash(TOKEN_ANA)]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain('events/ev1/photos/p2')
  })
})
