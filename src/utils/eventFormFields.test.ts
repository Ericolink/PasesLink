import { describe, expect, it } from 'vitest'
import { buildEventInput } from './eventFormFields'
import { DEFAULT_PHONE_COUNTRY } from '../components/CountryCodeSelect'
import type { FormFields } from './eventFormFields'

// buildEventInput no toca Firestore (solo arma el objeto de input a partir
// del estado del formulario) — no necesita el emulador. Es la pieza que
// tanto la creación temprana como cada actualización incremental de la
// Fase 3 (ver persistProgress en EventCreate.tsx) usan para no divergir.
function baseForm(overrides: Partial<FormFields> = {}): FormFields {
  return {
    name: 'Fiesta de prueba',
    date: '2026-10-14',
    startTime: '',
    endTime: '',
    location: 'Salón de prueba',
    description: '',
    dressCode: '',
    templateId: 'default',
    accentColor: '',
    secondaryFontFamily: '',
    buttonVariant: 'solid',
    welcomeMessage: '',
    mapsUrl: '',
    entryMode: 'list',
    capacity: '100',
    maxCompanions: '0',
    customFields: [],
    requiresPayment: false,
    paymentMethods: ['transfer'],
    ticketPrice: '',
    currency: '$',
    paymentInstructions: '',
    organizerContactPhone: '',
    organizerContactPhoneCountry: DEFAULT_PHONE_COUNTRY,
    timeline: [],
    ...overrides,
  }
}

describe('buildEventInput', () => {
  it('recorta dressCode/mapsUrl vacíos a undefined en vez de mandar strings en blanco', () => {
    const input = buildEventInput(baseForm({ dressCode: '   ', mapsUrl: '  ' }), '', 100, 0)
    expect(input.dressCode).toBeUndefined()
    expect(input.mapsUrl).toBeUndefined()
  })

  it('sin requiresPayment, ignora los campos de pago aunque tengan datos cargados', () => {
    const input = buildEventInput(
      baseForm({ requiresPayment: false, paymentMethods: ['transfer', 'cash'], ticketPrice: '500', currency: 'USD' }),
      '',
      100,
      0,
    )
    expect(input.paymentMethods).toEqual([])
    expect(input.ticketPrice).toBe(0)
    expect(input.currency).toBe('')
  })

  it('con requiresPayment, conserva los campos de pago tal cual', () => {
    const input = buildEventInput(
      baseForm({ requiresPayment: true, paymentMethods: ['cash'], ticketPrice: '500', currency: 'USD', organizerContactPhone: '  55 1234  ' }),
      '',
      100,
      0,
    )
    expect(input.paymentMethods).toEqual(['cash'])
    expect(input.ticketPrice).toBe(500)
    expect(input.currency).toBe('USD')
    expect(input.organizerContactPhone).toBe('55 1234')
  })

  it('sin tipografía/botón custom, no manda themeOverrides', () => {
    const input = buildEventInput(baseForm(), '', 100, 0)
    expect(input.themeOverrides).toBeUndefined()
  })

  it('con tipografía o botón custom, arma themeOverrides solo con lo elegido', () => {
    const input = buildEventInput(baseForm({ buttonVariant: 'outline' }), '', 100, 0)
    expect(input.themeOverrides).toEqual({ buttonVariant: 'outline' })
  })

  it('usa la capacidad y los acompañantes ya parseados, no los strings crudos del form', () => {
    const input = buildEventInput(baseForm({ capacity: '250', maxCompanions: '3' }), '', 250, 3)
    expect(input.capacity).toBe(250)
    expect(input.maxCompanions).toBe(3)
  })
})
