import { describe, expect, it } from 'vitest'
import type { DocumentData } from 'firebase-admin/firestore'
import { guestLockTokensOk, hasPermission } from './permissions.js'

const baseEvent: DocumentData = { ownerId: 'owner-1' }

describe('hasPermission', () => {
  it('el dueño siempre puede, sin importar el permiso', () => {
    expect(hasPermission(baseEvent, 'owner-1', 'editEvent')).toBe(true)
    expect(hasPermission(baseEvent, 'owner-1', 'prepareOrders')).toBe(true)
  })

  it('un admin de plataforma siempre puede vía opts.isAdmin', () => {
    expect(hasPermission(baseEvent, 'random-uid', 'scanQr', { isAdmin: true })).toBe(true)
  })

  it('un uid sin relación con el evento no tiene ningún permiso', () => {
    expect(hasPermission(baseEvent, 'nadie', 'scanQr')).toBe(false)
    expect(hasPermission(baseEvent, 'nadie', 'viewOrders')).toBe(false)
  })

  describe('sistema legacy: coOrganizersMap + coOrganizerPermissions', () => {
    it('un coorganizador sin entrada de permisos cae a LEGACY_COORG_DEFAULTS, con los nuevos permisos derivados', () => {
      const event: DocumentData = { ...baseEvent, coOrganizersMap: { 'co-1': 'co@example.com' } }
      expect(hasPermission(event, 'co-1', 'addGuests')).toBe(true)
      expect(hasPermission(event, 'co-1', 'manageConcessions')).toBe(false)
      // Derivados de manageConcessions=false / confirmPayments=true (default legacy).
      expect(hasPermission(event, 'co-1', 'viewPayments')).toBe(true)
      expect(hasPermission(event, 'co-1', 'viewCatalog')).toBe(false)
      expect(hasPermission(event, 'co-1', 'viewOrders')).toBe(true) // confirmPayments=true alcanza
    })

    it('respeta los permisos explícitos guardados por-uid sobre los defaults legacy', () => {
      const event: DocumentData = {
        ...baseEvent,
        coOrganizersMap: { 'co-1': 'co@example.com' },
        coOrganizerPermissions: { 'co-1': { addGuests: false, manageConcessions: true } },
      }
      expect(hasPermission(event, 'co-1', 'addGuests')).toBe(false)
      expect(hasPermission(event, 'co-1', 'manageConcessions')).toBe(true)
      expect(hasPermission(event, 'co-1', 'viewCatalog')).toBe(true)
    })
  })

  describe('sistema legacy: concessionsStaffMap (staff de ventas, aislado)', () => {
    it('cashier ve pagos/pedidos/ventas pero nada de coorganizador', () => {
      const event: DocumentData = {
        ...baseEvent,
        concessions: { concessionsStaffMap: { 'cashier-1': { roles: { cashier: true, prep: false } } } },
      }
      expect(hasPermission(event, 'cashier-1', 'viewPayments')).toBe(true)
      expect(hasPermission(event, 'cashier-1', 'confirmPayments')).toBe(true)
      expect(hasPermission(event, 'cashier-1', 'viewSales')).toBe(true)
      expect(hasPermission(event, 'cashier-1', 'prepareOrders')).toBe(false)
      expect(hasPermission(event, 'cashier-1', 'addGuests')).toBe(false)
      expect(hasPermission(event, 'cashier-1', 'scanQr')).toBe(false)
    })

    it('prep ve pedidos/catálogo pero nunca pagos', () => {
      const event: DocumentData = {
        ...baseEvent,
        concessions: { concessionsStaffMap: { 'prep-1': { roles: { cashier: false, prep: true } } } },
      }
      expect(hasPermission(event, 'prep-1', 'viewOrders')).toBe(true)
      expect(hasPermission(event, 'prep-1', 'prepareOrders')).toBe(true)
      expect(hasPermission(event, 'prep-1', 'viewPayments')).toBe(false)
      expect(hasPermission(event, 'prep-1', 'confirmPayments')).toBe(false)
    })

    it('shape legado (string = solo email) se resuelve como solo-preparación', () => {
      const event: DocumentData = { ...baseEvent, concessions: { concessionsStaffMap: { 'legacy-1': 'legacy@example.com' } } }
      expect(hasPermission(event, 'legacy-1', 'prepareOrders')).toBe(true)
      expect(hasPermission(event, 'legacy-1', 'confirmPayments')).toBe(false)
    })
  })

  describe('sistema nuevo: event.collaborators', () => {
    it('rol administrador tiene acceso completo', () => {
      const event: DocumentData = { ...baseEvent, collaborators: { 'admin-1': { role: 'administrador' } } }
      expect(hasPermission(event, 'admin-1', 'addGuests')).toBe(true)
      expect(hasPermission(event, 'admin-1', 'prepareOrders')).toBe(true)
    })

    it('roles operativos angostos (ej. preparacion) solo ven lo suyo', () => {
      const event: DocumentData = { ...baseEvent, collaborators: { 'prep-1': { role: 'preparacion' } } }
      expect(hasPermission(event, 'prep-1', 'viewOrders')).toBe(true)
      expect(hasPermission(event, 'prep-1', 'prepareOrders')).toBe(true)
      expect(hasPermission(event, 'prep-1', 'viewPayments')).toBe(false)
      expect(hasPermission(event, 'prep-1', 'addGuests')).toBe(false)
    })

    it('permissionOverrides puede otorgar un permiso puntual fuera del preset (ej. Recepción + confirmar pagos)', () => {
      const event: DocumentData = {
        ...baseEvent,
        collaborators: { 'recep-1': { role: 'recepcion', permissionOverrides: { confirmPayments: true } } },
      }
      expect(hasPermission(event, 'recep-1', 'scanQr')).toBe(true)
      expect(hasPermission(event, 'recep-1', 'confirmPayments')).toBe(true) // override
      expect(hasPermission(event, 'recep-1', 'viewCatalog')).toBe(false) // resto del preset intacto
    })

    it('event.collaborators tiene prioridad sobre coOrganizersMap si el mismo uid está en ambos', () => {
      const event: DocumentData = {
        ...baseEvent,
        coOrganizersMap: { 'uid-1': 'legacy@example.com' },
        collaborators: { 'uid-1': { role: 'caja' } },
      }
      // Si ganara el mapa legacy, addGuests sería true (LEGACY_COORG_DEFAULTS).
      expect(hasPermission(event, 'uid-1', 'addGuests')).toBe(false)
      expect(hasPermission(event, 'uid-1', 'confirmPayments')).toBe(true)
    })

    it('rol comunidad solo puede moderar el muro (Fase 5)', () => {
      const event: DocumentData = { ...baseEvent, collaborators: { 'com-1': { role: 'comunidad' } } }
      expect(hasPermission(event, 'com-1', 'moderateWall')).toBe(true)
      expect(hasPermission(event, 'com-1', 'postWall')).toBe(true)
      expect(hasPermission(event, 'com-1', 'addGuests')).toBe(false)
      expect(hasPermission(event, 'com-1', 'scanQr')).toBe(false)
      expect(hasPermission(event, 'com-1', 'manageConcessions')).toBe(false)
    })
  })

  describe('opts.isAdmin gana sobre cualquier resultado de rol', () => {
    it('un admin sin relación con el evento igual puede confirmar pagos/hacer check-in', () => {
      expect(hasPermission(baseEvent, 'admin-uid', 'confirmPayments', { isAdmin: true })).toBe(true)
      expect(hasPermission(baseEvent, 'admin-uid', 'scanQr', { isAdmin: true })).toBe(true)
    })
  })
})

describe('guestLockTokensOk', () => {
  it('sin lockTokens o vacío siempre pasa (pase sin reclamar)', () => {
    expect(guestLockTokensOk({}, null)).toBe(true)
    expect(guestLockTokensOk({ lockTokens: [] }, 'algún-token')).toBe(true)
  })

  it('con lockTokens, exige que el token entrante esté en la lista', () => {
    expect(guestLockTokensOk({ lockTokens: ['a', 'b'] }, 'a')).toBe(true)
    expect(guestLockTokensOk({ lockTokens: ['a', 'b'] }, 'c')).toBe(false)
    expect(guestLockTokensOk({ lockTokens: ['a', 'b'] }, null)).toBe(false)
  })
})
