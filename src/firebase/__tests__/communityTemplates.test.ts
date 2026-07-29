import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { createTestEnv, type EmulatorFirestore } from './helpers'
import type { CommunityTemplate } from '../../types'

const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import {
  deleteCommunityTemplate,
  reviewCommunityTemplate,
  submitCommunityTemplate,
  subscribeToApprovedCommunityTemplates,
  subscribeToMyCommunityTemplates,
  updateCommunityTemplate,
} from '../communityTemplates'

const AUTHOR_UID = 'author-uid'
const OTHER_UID = 'other-uid'
const ADMIN_UID = 'admin-uid'

const VALID_VARS = {
  accent: '#2563eb',
  accentDark: '#1d4ed8',
  accentSoft: '#dbeafe',
  pageBg: '#eef1f5',
  surface: '#ffffff',
  text: '#111827',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  fontFamily: 'inherit',
  borderRadius: '0.5rem',
  shadow: '0 4px 12px rgba(0,0,0,.15)',
  enterAnimation: 'animate-fade-in-up' as const,
}

async function seedAdmin(testEnv: RulesTestEnvironment, uid: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'admins', uid), { addedAt: Date.now() })
  })
}

function waitForSnapshot<T>(subscribe: (cb: (items: T[]) => void, onError?: (e: Error) => void) => () => void): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const unsub = subscribe(
      (items) => {
        unsub()
        resolve(items)
      },
      (err) => {
        unsub()
        reject(err)
      },
    )
  })
}

describe('communityTemplates.ts', () => {
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

  it('lets an authenticated user submit a draft and later submit it for review', async () => {
    dbHolder.db = testEnv.authenticatedContext(AUTHOR_UID).firestore()

    const id = await submitCommunityTemplate({
      authorUid: AUTHOR_UID,
      authorDisplayName: 'Ana Diseñadora',
      name: 'Minimal Blue',
      description: 'Un tema simple.',
      category: 'Genérico',
      vars: VALID_VARS,
      license: 'CC-BY',
      compatibility: [],
      submit: false,
    })

    let mine = await waitForSnapshot<CommunityTemplate>((cb, onErr) => subscribeToMyCommunityTemplates(AUTHOR_UID, cb, onErr))
    expect(mine).toHaveLength(1)
    expect(mine[0].status).toBe('draft')

    await updateCommunityTemplate(id, {
      name: 'Minimal Blue',
      description: 'Un tema simple, actualizado.',
      category: 'Genérico',
      vars: VALID_VARS,
      license: 'CC-BY',
      compatibility: [],
      submit: true,
      previousVersion: 1,
    })

    mine = await waitForSnapshot<CommunityTemplate>((cb, onErr) => subscribeToMyCommunityTemplates(AUTHOR_UID, cb, onErr))
    expect(mine[0].status).toBe('in_review')
    expect(mine[0].version).toBe(2)
  })

  it('rejects a submission where authorUid does not match the caller', async () => {
    dbHolder.db = testEnv.authenticatedContext(AUTHOR_UID).firestore()

    await expect(
      submitCommunityTemplate({
        authorUid: OTHER_UID,
        authorDisplayName: 'Impostor',
        name: 'Fake',
        description: '',
        category: 'Genérico',
        vars: VALID_VARS,
        license: '',
        compatibility: [],
        submit: false,
      }),
    ).rejects.toThrow()
  })

  it('lets an admin approve a submission, publishing it for anyone authenticated to see', async () => {
    dbHolder.db = testEnv.authenticatedContext(AUTHOR_UID).firestore()
    const id = await submitCommunityTemplate({
      authorUid: AUTHOR_UID,
      authorDisplayName: 'Ana Diseñadora',
      name: 'Minimal Blue',
      description: '',
      category: 'Genérico',
      vars: VALID_VARS,
      license: '',
      compatibility: [],
      submit: true,
    })

    await seedAdmin(testEnv, ADMIN_UID)
    dbHolder.db = testEnv.authenticatedContext(ADMIN_UID).firestore()
    await reviewCommunityTemplate(id, { status: 'approved', reviewerUid: ADMIN_UID, reviewNotes: 'Se ve bien' })

    dbHolder.db = testEnv.authenticatedContext(OTHER_UID).firestore()
    const approved = await waitForSnapshot<CommunityTemplate>(subscribeToApprovedCommunityTemplates)
    expect(approved.map((t) => t.id)).toContain(id)
    expect(approved[0].status).toBe('approved')
  })

  it('does not let the author self-approve their own submission', async () => {
    dbHolder.db = testEnv.authenticatedContext(AUTHOR_UID).firestore()
    const id = await submitCommunityTemplate({
      authorUid: AUTHOR_UID,
      authorDisplayName: 'Ana Diseñadora',
      name: 'Minimal Blue',
      description: '',
      category: 'Genérico',
      vars: VALID_VARS,
      license: '',
      compatibility: [],
      submit: true,
    })

    await expect(
      updateDoc(doc(dbHolder.db, 'communityTemplates', id), { status: 'approved' }),
    ).rejects.toThrow()
  })

  it('does not let a non-admin, non-author user read someone else’s draft', async () => {
    dbHolder.db = testEnv.authenticatedContext(AUTHOR_UID).firestore()
    const id = await submitCommunityTemplate({
      authorUid: AUTHOR_UID,
      authorDisplayName: 'Ana Diseñadora',
      name: 'Minimal Blue',
      description: '',
      category: 'Genérico',
      vars: VALID_VARS,
      license: '',
      compatibility: [],
      submit: false,
    })

    const strangerDb = testEnv.authenticatedContext(OTHER_UID).firestore()
    await assertFails(updateDoc(doc(strangerDb, 'communityTemplates', id), { name: 'Hijacked' }))
  })

  it('lets the author delete only while still a draft', async () => {
    dbHolder.db = testEnv.authenticatedContext(AUTHOR_UID).firestore()
    const draftId = await submitCommunityTemplate({
      authorUid: AUTHOR_UID,
      authorDisplayName: 'Ana Diseñadora',
      name: 'Draft',
      description: '',
      category: 'Genérico',
      vars: VALID_VARS,
      license: '',
      compatibility: [],
      submit: false,
    })
    await deleteCommunityTemplate(draftId)

    const submittedId = await submitCommunityTemplate({
      authorUid: AUTHOR_UID,
      authorDisplayName: 'Ana Diseñadora',
      name: 'In review',
      description: '',
      category: 'Genérico',
      vars: VALID_VARS,
      license: '',
      compatibility: [],
      submit: true,
    })
    await expect(deleteCommunityTemplate(submittedId)).rejects.toThrow()
  })
})
