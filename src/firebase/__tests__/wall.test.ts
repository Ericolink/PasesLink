import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { createTestEnv, seedEvent, type EmulatorFirestore } from './helpers'

// Mismo mock que guests.test.ts/photos.test.ts: redirige el `db` singleton de
// wall.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { deleteWallMessage, postWallMessage, replyToWallMessage } from '../wall'

const OWNER_UID = 'owner-uid'
const COORG_UID = 'coorg-uid'
const EVENT_ID = 'event-1'

async function getWallMessages(testEnv: RulesTestEnvironment) {
  let result: Record<string, unknown>[] = []
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDocs(collection(context.firestore(), 'events', EVENT_ID, 'wall'))
    result = snap.docs.map((d) => d.data())
  })
  return result
}

async function seedWallMessage(testEnv: RulesTestEnvironment, messageId: string, overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'events', EVENT_ID, 'wall', messageId), {
      text: 'Mensaje de prueba',
      type: 'comment',
      authorName: 'Invitado',
      authorToken: 'guest-token',
      authorRole: 'guest',
      authorPhotoURL: null,
      reactions: {},
      replies: [],
      deleted: false,
      pinned: false,
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

// Fase 1 de la auditoría de seguridad: antes, `authorRole` no se validaba en
// absoluto al crear un mensaje nuevo — cualquiera hablando directo contra
// Firestore podía postear como 'owner' (suplantación del organizador,
// issue #165). Tampoco existía ningún gate para el permiso `postWall` de
// coanfitrión (issue #122) — el toggle del editor no tenía efecto real.
describe('wall.ts — authorRole y postWall', () => {
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

  it('rejects an unauthenticated guest posting with authorRole "owner" (impersonation)', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(
      postWallMessage(EVENT_ID, 'Hola', 'comment', 'Falso organizador', 'tok-1', 'owner'),
    ).rejects.toThrow()

    expect(await getWallMessages(testEnv)).toHaveLength(0)
  })

  it('rejects a logged-in non-owner posting with authorRole "owner"', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    dbHolder.db = testEnv.authenticatedContext('random-guest-uid').firestore()

    await expect(
      postWallMessage(EVENT_ID, 'Hola', 'comment', 'Falso organizador', 'tok-2', 'owner'),
    ).rejects.toThrow()
  })

  it('lets the real event owner post with authorRole "owner"', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await postWallMessage(EVENT_ID, 'Bienvenidos!', 'comment', 'El organizador', 'tok-3', 'owner')

    const messages = await getWallMessages(testEnv)
    expect(messages).toHaveLength(1)
    expect(messages[0].authorRole).toBe('owner')
  })

  it('lets an unauthenticated guest post with authorRole "guest"', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await postWallMessage(EVENT_ID, 'Hola a todos', 'comment', 'Invitado', 'tok-4', 'guest')

    expect(await getWallMessages(testEnv)).toHaveLength(1)
  })

  it('rejects a co-organizer without the postWall permission from posting at all', async () => {
    await seedEvent(testEnv, EVENT_ID, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: {
          addGuests: false, editGuests: false, deleteGuests: false, shareInviteLink: false,
          confirmPayments: false, scanQr: false, viewGuestList: true, postWall: false,
          moderateWall: false, editEvent: false, manageCoOrganizers: false, viewReports: false,
          exportLists: false, downloadEventInfo: false,
        },
      },
    })
    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()

    await expect(
      postWallMessage(EVENT_ID, 'Hola', 'comment', 'Coanfitrión', 'tok-5', 'guest'),
    ).rejects.toThrow()
  })

  it('lets a co-organizer with the postWall permission post', async () => {
    await seedEvent(testEnv, EVENT_ID, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: {
          addGuests: false, editGuests: false, deleteGuests: false, shareInviteLink: false,
          confirmPayments: false, scanQr: false, viewGuestList: true, postWall: true,
          moderateWall: false, editEvent: false, manageCoOrganizers: false, viewReports: false,
          exportLists: false, downloadEventInfo: false,
        },
      },
    })
    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()

    await postWallMessage(EVENT_ID, 'Hola', 'comment', 'Coanfitrión', 'tok-6', 'guest')

    expect(await getWallMessages(testEnv)).toHaveLength(1)
  })

  it('rejects a direct write appending a reply with authorRole "owner" from a non-owner', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedWallMessage(testEnv, 'msg-1')
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(
      replyToWallMessage(EVENT_ID, 'msg-1', 'Respuesta falsa', [], 'Falso organizador', 'tok-7', 'owner'),
    ).rejects.toThrow()
  })

  it('lets the real owner reply with authorRole "owner"', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedWallMessage(testEnv, 'msg-1')
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await replyToWallMessage(EVENT_ID, 'msg-1', 'Respuesta real', [], 'El organizador', 'tok-8', 'owner')

    const messages = await getWallMessages(testEnv)
    expect((messages[0].replies as { authorRole: string }[])).toHaveLength(1)
    expect((messages[0].replies as { authorRole: string }[])[0].authorRole).toBe('owner')
  })

  // Issue #157: antes solo un organizador/co-org con moderateWall podía
  // borrar CUALQUIER mensaje — un invitado no tenía forma de borrar el
  // suyo propio. deleteWallMessage hace un soft-delete (`deleted: true`
  // vía update, no un delete real) — solo se puede autorizar de forma
  // verificable del lado servidor para un autor CON SESIÓN, cuyo
  // authorToken quedó igual a su uid al postear (ver EventWall.tsx). Un
  // invitado sin cuenta no tiene identidad verificable, así que no puede
  // autoborrarse server-side (documentado en la rule misma).
  it('lets a logged-in author soft-delete their own message', async () => {
    const AUTHOR_UID = 'author-uid'
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedWallMessage(testEnv, 'msg-1', { authorToken: AUTHOR_UID })
    dbHolder.db = testEnv.authenticatedContext(AUTHOR_UID).firestore()

    await deleteWallMessage(EVENT_ID, 'msg-1')

    const messages = await getWallMessages(testEnv)
    expect(messages[0].deleted).toBe(true)
  })

  it('rejects a logged-in user soft-deleting a message they did not author', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedWallMessage(testEnv, 'msg-1', { authorToken: 'author-uid' })
    dbHolder.db = testEnv.authenticatedContext('someone-else-uid').firestore()

    await expect(deleteWallMessage(EVENT_ID, 'msg-1')).rejects.toThrow()
  })

  it('rejects an unauthenticated request soft-deleting a message even if it claims the matching authorToken', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedWallMessage(testEnv, 'msg-1', { authorToken: 'guest-name-token' })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(deleteWallMessage(EVENT_ID, 'msg-1')).rejects.toThrow()
  })
})

describe('wall.ts — reject direct writes bypassing postWallMessage entirely', () => {
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

  it('rejects a raw addDoc-equivalent write with authorRole "owner" from someone who is not the owner', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    const intruderDb = testEnv.authenticatedContext('intruder-uid').firestore()

    await assertFails(
      setDoc(doc(intruderDb, 'events', EVENT_ID, 'wall', 'fake-msg'), {
        text: 'Mensaje falso del organizador',
        type: 'comment',
        authorName: 'El organizador',
        authorToken: 'fake-token',
        authorRole: 'owner',
        reactions: {},
        replies: [],
        deleted: false,
        pinned: false,
        createdAt: Date.now(),
      }),
    )
  })
})
