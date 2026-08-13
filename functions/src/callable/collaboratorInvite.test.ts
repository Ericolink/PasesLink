import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { Timestamp } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { createCollaboratorInvite } from './createCollaboratorInvite.js'
import { acceptCollaboratorInvite } from './acceptCollaboratorInvite.js'

// Fase 3 de ROLES_PERMISSIONS_REDESIGN.md — primer test directo para un
// flujo de invitación de colaborador en este proyecto (createCoOrganizerInvite/
// acceptCoOrganizerInvite y sus pares de concesiones nunca tuvieron cobertura
// propia, ver memoria de esa fase). Cubre create + accept de punta a punta
// contra el emulador de Firestore con Admin SDK real (sin mockear).

async function getEvent(db: Firestore, eventId: string) {
  const snap = await db.collection('events').doc(eventId).get()
  return snap.data()
}

async function getInvite(db: Firestore, eventId: string, token: string) {
  const snap = await db.collection('events').doc(eventId).collection('collaboratorInvites').doc(token).get()
  return snap.data()
}

describe('createCollaboratorInvite', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('el dueño puede crear una invitación para cualquier rol', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'owner-uid' })

    const result = await createCollaboratorInvite.run(
      fakeCallableRequest({ eventId, role: 'caja' }, 'owner-uid'),
    )

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('expected success')
    const invite = await getInvite(db, eventId, result.token)
    expect(invite?.role).toBe('caja')
    expect(invite?.usedBy).toBeNull()
  })

  it('un colaborador con rol administrador (event.collaborators) también puede invitar', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: 'owner-uid',
      collaborators: { 'admin-uid': { role: 'administrador', email: 'a@test.com' } },
    })

    const result = await createCollaboratorInvite.run(
      fakeCallableRequest({ eventId, role: 'preparacion' }, 'admin-uid'),
    )

    expect(result.status).toBe('success')
  })

  it('rechaza a un colaborador sin manageCoOrganizers (rol ventas)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: 'owner-uid',
      collaborators: { 'ventas-uid': { role: 'ventas', email: 'v@test.com' } },
    })

    await expect(
      createCollaboratorInvite.run(fakeCallableRequest({ eventId, role: 'caja' }, 'ventas-uid')),
    ).rejects.toThrow(/permiso/)
  })

  it('rechaza un rol inválido', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'owner-uid' })

    await expect(
      createCollaboratorInvite.run(fakeCallableRequest({ eventId, role: 'super-admin' }, 'owner-uid')),
    ).rejects.toThrow(/[Rr]ol inválido/)
  })

  it('rechaza permissionOverrides con un valor no booleano', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'owner-uid' })

    await expect(
      createCollaboratorInvite.run(
        fakeCallableRequest({ eventId, role: 'recepcion', permissionOverrides: { confirmPayments: 'yes' } }, 'owner-uid'),
      ),
    ).rejects.toThrow(/[Pp]ermisos personalizados inválidos/)
  })

  it('devuelve status "full" cuando ya se alcanzó el tope de colaboradores', async () => {
    const eventId = uniqueId('event')
    const collaborators: Record<string, unknown> = {}
    for (let i = 0; i < 20; i += 1) collaborators[`uid-${i}`] = { role: 'preparacion', email: `p${i}@test.com` }
    await seedEvent(db, eventId, { ownerId: 'owner-uid', collaborators })

    const result = await createCollaboratorInvite.run(
      fakeCallableRequest({ eventId, role: 'caja' }, 'owner-uid'),
    )

    expect(result.status).toBe('full')
  })
})

describe('acceptCollaboratorInvite', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('canjea un token válido y suma al colaborador con el rol/overrides de la invitación', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'owner-uid' })
    await db.collection('events').doc(eventId).collection('collaboratorInvites').doc('tok-1').set({
      createdBy: 'owner-uid',
      createdByEmail: 'owner@test.com',
      role: 'caja',
      permissionOverrides: { viewSales: false },
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      usedBy: null,
      usedAt: null,
    })

    const result = await acceptCollaboratorInvite.run(
      fakeCallableRequest({ eventId, token: 'tok-1' }, 'new-uid'),
    )

    expect(result.status).toBe('success')
    const event = await getEvent(db, eventId)
    const entry = (event?.collaborators as Record<string, Record<string, unknown>>)['new-uid']
    expect(entry.role).toBe('caja')
    expect(entry.permissionOverrides).toEqual({ viewSales: false })
    expect(entry.invitedBy).toBe('owner-uid')

    const invite = await getInvite(db, eventId, 'tok-1')
    expect(invite?.usedBy).toBe('new-uid')
  })

  it('es idempotente si quien acepta ya es colaborador (de cualquier rol)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: 'owner-uid',
      collaborators: { 'already-uid': { role: 'recepcion', email: 'r@test.com' } },
    })
    await db.collection('events').doc(eventId).collection('collaboratorInvites').doc('tok-1').set({
      createdBy: 'owner-uid',
      role: 'caja',
      permissionOverrides: null,
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      usedBy: null,
      usedAt: null,
    })

    const result = await acceptCollaboratorInvite.run(
      fakeCallableRequest({ eventId, token: 'tok-1' }, 'already-uid'),
    )

    expect(result.status).toBe('already_member')
    const event = await getEvent(db, eventId)
    // El rol existente NO se pisa con el de la invitación (recepcion, no caja).
    expect((event?.collaborators as Record<string, Record<string, unknown>>)['already-uid'].role).toBe('recepcion')
  })

  it('rechaza un token ya usado', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'owner-uid' })
    await db.collection('events').doc(eventId).collection('collaboratorInvites').doc('tok-1').set({
      createdBy: 'owner-uid',
      role: 'caja',
      expiresAt: Timestamp.fromMillis(Date.now() + 60_000),
      usedBy: 'someone-else',
      usedAt: Timestamp.now(),
    })

    const result = await acceptCollaboratorInvite.run(fakeCallableRequest({ eventId, token: 'tok-1' }, 'new-uid'))
    expect(result.status).toBe('used')
  })

  it('rechaza un token vencido', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'owner-uid' })
    await db.collection('events').doc(eventId).collection('collaboratorInvites').doc('tok-1').set({
      createdBy: 'owner-uid',
      role: 'caja',
      expiresAt: Timestamp.fromMillis(Date.now() - 1_000),
      usedBy: null,
      usedAt: null,
    })

    const result = await acceptCollaboratorInvite.run(fakeCallableRequest({ eventId, token: 'tok-1' }, 'new-uid'))
    expect(result.status).toBe('expired')
  })

  it('devuelve not_found para un token inexistente', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'owner-uid' })

    const result = await acceptCollaboratorInvite.run(fakeCallableRequest({ eventId, token: 'no-existe' }, 'new-uid'))
    expect(result.status).toBe('not_found')
  })
})
