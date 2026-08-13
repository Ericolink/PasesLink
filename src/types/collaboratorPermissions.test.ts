import { describe, expect, it } from 'vitest'
import { resolveCollaboratorPermissions } from './collaboratorPermissions'
import type { EventData } from './index'

type MinimalEvent = Pick<
  EventData,
  'ownerId' | 'coOrganizersMap' | 'coOrganizerPermissions' | 'collaborators' | 'concessions'
>

const baseEvent: MinimalEvent = {
  ownerId: 'owner-1',
}

describe('resolveCollaboratorPermissions', () => {
  it('sin evento o sin uid devuelve NO_COLLABORATOR_ACCESS', () => {
    expect(resolveCollaboratorPermissions(null, 'uid-1').hasAccess).toBe(false)
    expect(resolveCollaboratorPermissions(baseEvent, null).hasAccess).toBe(false)
  })

  it('el dueño tiene acceso completo, incluidos los permisos nuevos', () => {
    const perms = resolveCollaboratorPermissions(baseEvent, 'owner-1')
    expect(perms.isOwner).toBe(true)
    expect(perms.isCoOrg).toBe(false)
    expect(perms.hasAccess).toBe(true)
    expect(perms.editEvent).toBe(true)
    expect(perms.viewPayments).toBe(true)
    expect(perms.viewCatalog).toBe(true)
    expect(perms.prepareOrders).toBe(true)
  })

  it('un uid sin relación con el evento no tiene acceso', () => {
    const perms = resolveCollaboratorPermissions(baseEvent, 'nadie')
    expect(perms.hasAccess).toBe(false)
    expect(perms.scanQr).toBe(false)
    expect(perms.viewOrders).toBe(false)
  })

  describe('sistema legacy: coOrganizersMap + coOrganizerPermissions', () => {
    it('un coorganizador sin entrada de permisos cae a LEGACY_COORG_DEFAULTS, con los nuevos permisos derivados', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        coOrganizersMap: { 'co-1': 'co@example.com' },
      }
      const perms = resolveCollaboratorPermissions(event, 'co-1')
      expect(perms.isCoOrg).toBe(true)
      expect(perms.hasAccess).toBe(true)
      expect(perms.addGuests).toBe(true)
      expect(perms.manageConcessions).toBe(false)
      // Derivados de manageConcessions=false / confirmPayments=true (default legacy).
      expect(perms.viewPayments).toBe(true)
      expect(perms.viewCatalog).toBe(false)
      expect(perms.viewOrders).toBe(true) // confirmPayments=true alcanza
      expect(perms.prepareOrders).toBe(false)
    })

    it('respeta los permisos explícitos guardados por-uid sobre los defaults legacy', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        coOrganizersMap: { 'co-1': 'co@example.com' },
        coOrganizerPermissions: {
          'co-1': {
            addGuests: false,
            editGuests: false,
            deleteGuests: false,
            shareInviteLink: false,
            confirmPayments: false,
            scanQr: true,
            viewGuestList: true,
            postWall: true,
            moderateWall: false,
            editEvent: false,
            manageCoOrganizers: false,
            viewReports: false,
            exportLists: false,
            downloadEventInfo: false,
            manageSeating: false,
            viewLiveDashboard: false,
            manageConcessions: true,
          },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'co-1')
      expect(perms.addGuests).toBe(false)
      expect(perms.scanQr).toBe(true)
      expect(perms.manageConcessions).toBe(true)
      expect(perms.viewCatalog).toBe(true)
      expect(perms.viewPayments).toBe(false) // confirmPayments=false acá
      expect(perms.viewOrders).toBe(true) // manageConcessions=true alcanza
    })
  })

  describe('sistema legacy: concessionsStaffMap (staff de ventas, aislado)', () => {
    it('cashier ve pagos/pedidos/ventas pero nada de coorganizador', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        concessions: {
          enabled: true,
          currency: 'MXN',
          paymentMethods: ['cash'],
          useEventPaymentInstructions: true,
          concessionsStaffMap: { 'cashier-1': { email: 'cashier@example.com', roles: { cashier: true, prep: false } } },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'cashier-1')
      expect(perms.isCoOrg).toBe(false)
      expect(perms.hasAccess).toBe(false)
      expect(perms.viewPayments).toBe(true)
      expect(perms.confirmPayments).toBe(true)
      expect(perms.viewSales).toBe(true)
      expect(perms.viewOrders).toBe(true)
      expect(perms.prepareOrders).toBe(false)
      // Sin acceso a nada del sistema de coorganizador.
      expect(perms.addGuests).toBe(false)
      expect(perms.scanQr).toBe(false)
      expect(perms.editEvent).toBe(false)
    })

    it('prep ve pedidos/catálogo pero nunca pagos', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        concessions: {
          enabled: true,
          currency: 'MXN',
          paymentMethods: ['cash'],
          useEventPaymentInstructions: true,
          concessionsStaffMap: { 'prep-1': { email: 'prep@example.com', roles: { cashier: false, prep: true } } },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'prep-1')
      expect(perms.viewOrders).toBe(true)
      expect(perms.prepareOrders).toBe(true)
      expect(perms.viewCatalog).toBe(true)
      expect(perms.viewPayments).toBe(false)
      expect(perms.confirmPayments).toBe(false)
      expect(perms.viewSales).toBe(false)
    })

    it('shape legado (string = solo email) se resuelve como solo-preparación', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        concessions: {
          enabled: true,
          currency: 'MXN',
          paymentMethods: ['cash'],
          useEventPaymentInstructions: true,
          concessionsStaffMap: { 'legacy-1': 'legacy@example.com' },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'legacy-1')
      expect(perms.prepareOrders).toBe(true)
      expect(perms.confirmPayments).toBe(false)
    })
  })

  describe('sistema nuevo: event.collaborators', () => {
    it('rol administrador tiene isCoOrg/hasAccess igual que un coorganizador', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        collaborators: {
          'admin-1': { email: 'a@example.com', role: 'administrador', invitedBy: 'owner-1', invitedAt: 1 },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'admin-1')
      expect(perms.isCoOrg).toBe(true)
      expect(perms.hasAccess).toBe(true)
      expect(perms.addGuests).toBe(true)
      expect(perms.prepareOrders).toBe(true)
    })

    it('roles operativos angostos (ej. preparacion) no tienen isCoOrg/hasAccess', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        collaborators: {
          'prep-1': { email: 'p@example.com', role: 'preparacion', invitedBy: 'owner-1', invitedAt: 1 },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'prep-1')
      expect(perms.isCoOrg).toBe(false)
      expect(perms.hasAccess).toBe(false)
      expect(perms.viewOrders).toBe(true)
      expect(perms.prepareOrders).toBe(true)
      expect(perms.viewPayments).toBe(false)
      expect(perms.addGuests).toBe(false)
    })

    it('rol comunidad solo puede moderar el muro, nada más del evento (Fase 5)', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        collaborators: {
          'com-1': { email: 'c@example.com', role: 'comunidad', invitedBy: 'owner-1', invitedAt: 1 },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'com-1')
      expect(perms.moderateWall).toBe(true)
      expect(perms.postWall).toBe(true)
      expect(perms.isCoOrg).toBe(false)
      expect(perms.hasAccess).toBe(false)
      expect(perms.addGuests).toBe(false)
      expect(perms.scanQr).toBe(false)
      expect(perms.viewCatalog).toBe(false)
    })

    it('permissionOverrides puede otorgar un permiso puntual fuera del preset (ej. Recepción + confirmar pagos)', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        collaborators: {
          'recep-1': {
            email: 'r@example.com',
            role: 'recepcion',
            permissionOverrides: { confirmPayments: true },
            invitedBy: 'owner-1',
            invitedAt: 1,
          },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'recep-1')
      expect(perms.scanQr).toBe(true)
      expect(perms.confirmPayments).toBe(true) // override
      expect(perms.viewCatalog).toBe(false) // resto del preset intacto
    })

    it('event.collaborators tiene prioridad sobre coOrganizersMap si el mismo uid está en ambos', () => {
      const event: MinimalEvent = {
        ...baseEvent,
        coOrganizersMap: { 'uid-1': 'legacy@example.com' },
        collaborators: {
          'uid-1': { email: 'uid-1@example.com', role: 'caja', invitedBy: 'owner-1', invitedAt: 1 },
        },
      }
      const perms = resolveCollaboratorPermissions(event, 'uid-1')
      // Si ganara el mapa legacy, addGuests sería true (LEGACY_COORG_DEFAULTS).
      expect(perms.addGuests).toBe(false)
      expect(perms.confirmPayments).toBe(true)
    })
  })
})
