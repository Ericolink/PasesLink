import { describe, expect, it } from 'vitest'
import { describeViewerClaimRole, getClaimableRoster } from './companionRoster'
import type { GuestData } from '../types'

function makeGuest(overrides: Partial<GuestData> = {}): GuestData {
  return {
    id: 'g1',
    name: 'Eric',
    lastName: 'Muñoz',
    qrToken: 'token1',
    status: 'invited',
    companions: [],
    rsvpStatus: 'pending',
    checkedInAt: null,
    checkedInBy: null,
    checkedInByEmail: null,
    checkedOutAt: null,
    checkedOutByEmail: null,
    exitType: null,
    lockToken: null,
    paymentStatus: 'unpaid',
    paymentMethod: null,
    createdAt: 0,
    ...overrides,
  }
}

describe('getClaimableRoster', () => {
  it('returns just the principal for a solo guest with no companions', () => {
    const guest = makeGuest()
    expect(getClaimableRoster(guest)).toEqual([{ index: 0, fullName: 'Eric Muñoz', claimedByUid: null }])
  })

  it('lists the principal and every named companion, even with different last names', () => {
    const guest = makeGuest({
      companions: [
        { name: 'Ana', lastName: 'García' },
        { name: 'Carlos', lastName: 'Hernández' },
      ],
    })
    expect(getClaimableRoster(guest)).toEqual([
      { index: 0, fullName: 'Eric Muñoz', claimedByUid: null },
      { index: 1, fullName: 'Ana García', claimedByUid: null },
      { index: 2, fullName: 'Carlos Hernández', claimedByUid: null },
    ])
  })

  it('skips companions without a name (legacy anonymous headcount)', () => {
    const guest = makeGuest({ companions: [{}, { name: 'Ana', lastName: 'García' }] })
    expect(getClaimableRoster(guest)).toEqual([
      { index: 0, fullName: 'Eric Muñoz', claimedByUid: null },
      { index: 2, fullName: 'Ana García', claimedByUid: null },
    ])
  })

  it('reflects guestUid/companionClaims as the claimedByUid of each row', () => {
    const guest = makeGuest({
      guestUid: 'eric-uid',
      companions: [{ name: 'Ana', lastName: 'García' }],
      companionClaims: { '1': 'ana-uid' },
    })
    expect(getClaimableRoster(guest)).toEqual([
      { index: 0, fullName: 'Eric Muñoz', claimedByUid: 'eric-uid' },
      { index: 1, fullName: 'Ana García', claimedByUid: 'ana-uid' },
    ])
  })

  it('excludes index 0 for a legacy group (isGroup without groupLabel) — name is a group label, not a person', () => {
    const guest = makeGuest({ name: 'Familia Muñoz', lastName: '', isGroup: true, companions: [{}, {}] })
    expect(getClaimableRoster(guest)).toEqual([])
  })

  it('includes index 0 for a new-style group (isGroup with groupLabel) — name/lastName are the first real member', () => {
    const guest = makeGuest({
      name: 'Eric', lastName: 'Muñoz', isGroup: true, groupLabel: 'Familia Muñoz',
      companions: [{ name: 'Ana', lastName: 'Muñoz' }, { name: 'María', lastName: 'García' }],
    })
    expect(getClaimableRoster(guest)).toEqual([
      { index: 0, fullName: 'Eric Muñoz', claimedByUid: null },
      { index: 1, fullName: 'Ana Muñoz', claimedByUid: null },
      { index: 2, fullName: 'María García', claimedByUid: null },
    ])
  })
})

describe('describeViewerClaimRole', () => {
  it('returns null without a logged-in viewer', () => {
    expect(describeViewerClaimRole(makeGuest(), null)).toBeNull()
  })

  it('returns null when the viewer has not claimed anyone in this invitation', () => {
    const guest = makeGuest({ guestUid: 'someone-else' })
    expect(describeViewerClaimRole(guest, 'eric-uid')).toBeNull()
  })

  it('tells the principal of an individual invitation they are the main guest', () => {
    const guest = makeGuest({ guestUid: 'eric-uid' })
    expect(describeViewerClaimRole(guest, 'eric-uid')).toBe('Eres el invitado principal de esta invitación.')
  })

  it('tells a claimed companion they are registered as a companion of the principal', () => {
    const guest = makeGuest({
      companions: [{ name: 'Ana', lastName: 'García' }],
      companionClaims: { '1': 'ana-uid' },
    })
    expect(describeViewerClaimRole(guest, 'ana-uid')).toBe('Estás registrado como acompañante de Eric Muñoz.')
  })

  it('tells any claimed member of a new-style group they belong to the family invitation', () => {
    const guest = makeGuest({
      name: 'Eric', lastName: 'Muñoz', isGroup: true, groupLabel: 'Familia Muñoz', guestUid: 'eric-uid',
      companions: [{ name: 'Ana', lastName: 'Muñoz' }],
      companionClaims: { '1': 'ana-uid' },
    })
    expect(describeViewerClaimRole(guest, 'eric-uid')).toBe('Formas parte de la invitación de Familia Muñoz.')
    expect(describeViewerClaimRole(guest, 'ana-uid')).toBe('Formas parte de la invitación de Familia Muñoz.')
  })

  // Un grupo legacy pudo haber quedado con guestUid seteado por el
  // comportamiento ANTERIOR a este rediseño (reclamo automático y silencioso
  // de cualquiera que abriera el pase primero, ver el bootstrap de
  // GuestPass.tsx) — ese uid no representa a ninguna persona real (`name`
  // ahí es un rótulo de grupo, no un integrante), así que no se muestra
  // ningún banner de identidad para él.
  it('shows no banner for a legacy group even if guestUid ended up set by the old silent-claim behavior', () => {
    const guest = makeGuest({
      name: 'Familia Muñoz', lastName: '', isGroup: true, guestUid: 'legacy-owner-uid',
    })
    expect(describeViewerClaimRole(guest, 'legacy-owner-uid')).toBeNull()
  })
})
