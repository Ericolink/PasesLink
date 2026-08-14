import { describe, expect, it } from 'vitest'
import { mapEvent } from './events'

// mapEvent no toca Firestore (solo transforma el data crudo del doc) — no
// necesita el emulador, a diferencia de los tests en __tests__/, que sí.
describe('mapEvent', () => {
  function baseData(overrides: Record<string, unknown> = {}) {
    return {
      ownerId: 'owner-1',
      name: 'Evento',
      date: '2026-01-01',
      location: 'Salón',
      plan: 'premium',
      paymentStatus: 'paid',
      status: 'active',
      guestCount: 10,
      checkedInCount: 0,
      occupancyCount: 0,
      ...overrides,
    }
  }

  it('usa peopleCount tal cual cuando el documento ya lo tiene', () => {
    const event = mapEvent('e1', baseData({ guestCount: 10, peopleCount: 25 }))
    expect(event.peopleCount).toBe(25)
  })

  it('eventos legacy sin peopleCount caen a guestCount, no a 0 (1 invitación = 1 persona)', () => {
    const event = mapEvent('e1', baseData({ guestCount: 10 }))
    expect(event.peopleCount).toBe(10)
  })

  it('un evento legacy recién creado (guestCount 0) sigue dando peopleCount 0', () => {
    const event = mapEvent('e1', baseData({ guestCount: 0 }))
    expect(event.peopleCount).toBe(0)
  })

  it('respeta peopleCount == 0 explícito sin confundirlo con "campo ausente"', () => {
    const event = mapEvent('e1', baseData({ guestCount: 10, peopleCount: 0 }))
    expect(event.peopleCount).toBe(0)
  })

  // Regresión real (2026-07-31): se agregó `concessions?: ConcessionsConfig`
  // a EventData (módulo de venta de comida/bebida) y mapEvent nunca copiaba
  // ese campo del documento crudo al objeto que consume el resto de la app.
  // La escritura (enableConcessionsBeta) siempre funcionó — confirmable a
  // mano en la consola de Firebase — pero ningún componente
  // (ConcessionsSection, ConcessionsManager, el link "Menú" de EventDetail)
  // se enteraba nunca de que el campo existía, porque `event.concessions`
  // daba `undefined` sin importar lo que hubiera en Firestore. Los tests de
  // reglas de src/firebase/__tests__/concessions.rules.test.ts nunca lo
  // detectaron porque prueban lecturas/escrituras crudas contra el
  // emulador, sin pasar nunca por mapEvent.
  it('no incluye `concessions` cuando el documento no lo tiene (evento que nunca activó el módulo)', () => {
    const event = mapEvent('e1', baseData())
    expect(event.concessions).toBeUndefined()
  })

  it('copia `concessions` tal cual del documento de Firestore al EventData mapeado', () => {
    const concessions = {
      enabled: true,
      storeName: 'Barra de Baile Improvisado',
      currency: 'MXN',
      paymentMethods: ['transfer', 'cash'],
      useEventPaymentInstructions: true,
      concessionsStaffMap: {},
    }
    const event = mapEvent('e1', baseData({ concessions }))
    expect(event.concessions).toEqual(concessions)
    expect(event.concessions?.enabled).toBe(true)
  })

  // Regresión real (2026-08-13) — SEGUNDA vez que pasa exactamente lo mismo
  // que con `concessions` arriba (2026-07-31): se agregó `collaborators` a
  // EventData (ROLES_PERMISSIONS_REDESIGN.md Fase 1) y mapEvent nunca lo
  // copiaba del documento crudo. La Cloud Function acceptCollaboratorInvite
  // escribía bien, las Firestore Rules y hasPermission() del lado servidor
  // resolvían bien — pero `event.collaborators` daba `undefined` en TODA la
  // app cliente (dashboard, EventDetail, redirect por rol), así que un
  // colaborador recién aceptado veía su evento listado en /dashboard (esa
  // query sí filtra sobre el campo crudo de Firestore) pero al entrar caía
  // sin ningún permiso real. Detectado por el usuario probando el flujo real
  // con un colaborador de rol Preparación — ninguno de los tests de
  // resolveCollaboratorPermissions/hasPermission/reglas lo detectó porque
  // todos construyen su propio EventData de prueba a mano, sin pasar nunca
  // por mapEvent (mismo punto ciego que ya dejó documentado el caso de
  // `concessions`).
  it('copia `collaborators` tal cual del documento de Firestore al EventData mapeado', () => {
    const collaborators = {
      'prep-uid': { email: 'prep@test.com', role: 'preparacion', invitedBy: 'owner-1', invitedAt: 1755000000000 },
    }
    const event = mapEvent('e1', baseData({ collaborators }))
    expect(event.collaborators).toEqual(collaborators)
    expect(event.collaborators?.['prep-uid']?.role).toBe('preparacion')
  })

  it('no incluye `collaborators` cuando el documento no lo tiene', () => {
    const event = mapEvent('e1', baseData())
    expect(event.collaborators).toBeUndefined()
  })

  it('normaliza `invitedAt` a number tanto si llega como Firestore Timestamp como si ya es number', () => {
    const fakeTimestamp = { toMillis: () => 1755000000000 }
    const collaborators = {
      'from-function': { email: 'f@test.com', role: 'caja', invitedBy: 'owner-1', invitedAt: fakeTimestamp },
      'from-backfill': { email: 'b@test.com', role: 'ventas', invitedBy: 'owner-1', invitedAt: 1755000000000 },
    }
    const event = mapEvent('e1', baseData({ collaborators }))
    expect(event.collaborators?.['from-function']?.invitedAt).toBe(1755000000000)
    expect(event.collaborators?.['from-backfill']?.invitedAt).toBe(1755000000000)
  })

  // Campos nuevos del rediseño de métodos de pago (transferencia + efectivo
  // no excluyentes) — mismo checklist que concessions/collaborators arriba:
  // agregar un campo a EventData no alcanza, hay que sumarlo acá también.
  it('copia los campos estructurados de transferencia y el mensaje de efectivo del documento crudo', () => {
    const event = mapEvent('e1', baseData({
      transferBankName: 'BBVA',
      transferAccountHolder: 'María Pérez',
      transferAccountNumber: '012180001234567895',
      transferReference: 'Nombre + evento',
      cashInstructions: 'Trae cambio exacto.',
    }))
    expect(event.transferBankName).toBe('BBVA')
    expect(event.transferAccountHolder).toBe('María Pérez')
    expect(event.transferAccountNumber).toBe('012180001234567895')
    expect(event.transferReference).toBe('Nombre + evento')
    expect(event.cashInstructions).toBe('Trae cambio exacto.')
  })

  it('los campos estructurados de pago caen a "" en un evento existente que todavía no los tiene', () => {
    const event = mapEvent('e1', baseData())
    expect(event.transferBankName).toBe('')
    expect(event.transferAccountHolder).toBe('')
    expect(event.transferAccountNumber).toBe('')
    expect(event.transferReference).toBe('')
    expect(event.cashInstructions).toBe('')
  })

  it('un evento legacy con requiresPayment pero sin paymentMethods sigue cayendo a ["transfer"]', () => {
    const event = mapEvent('e1', baseData({ requiresPayment: true }))
    expect(event.paymentMethods).toEqual(['transfer'])
  })
})
