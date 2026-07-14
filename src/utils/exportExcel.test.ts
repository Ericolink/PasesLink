import { describe, expect, it, vi } from 'vitest'
import { buildGuestListWorkbook } from './exportExcel'
import type { CustomField, EventData, GuestData } from '../types'

function makeEvent(overrides: Partial<EventData> = {}): EventData {
  return {
    id: 'evt1',
    ownerId: 'owner1',
    name: 'Fiesta de prueba',
    date: '2026-01-01',
    location: 'Algún lugar',
    entryMode: 'open',
    capacity: 100,
    requiresPayment: false,
    paymentMethods: [],
    ticketPrice: 0,
    currency: '',
    paymentInstructions: '',
    plan: 'premium',
    paymentStatus: 'paid',
    status: 'active',
    guestCount: 0,
    checkedInCount: 0,
    peopleCount: 0,
    occupancyCount: 0,
    paidCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeGuest(overrides: Partial<GuestData> = {}): GuestData {
  return {
    id: 'g1',
    name: 'Ana',
    lastName: 'Pérez',
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

// Todas las pruebas desactivan el logo: es puramente decorativo y depende de
// `fetch`, que no tiene sentido ejercitar acá (ver ExportExcelOptions.includeLogo).
const noLogo = { includeLogo: false }

describe('buildGuestListWorkbook', () => {
  it('incluye las columnas base con Nombre/Apellido primero y respeta los valores del invitado', async () => {
    const guest = makeGuest({ phone: '555-1234', email: 'ana@example.com' })
    const { workbook, result } = await buildGuestListWorkbook(makeEvent(), [guest], noLogo)

    expect(result).toBe('completed')
    const sheet = workbook.worksheets[0]
    const headers = sheet.getRow(4).values as unknown[]
    // getRow(...).values es 1-indexado con un hueco en el índice 0
    expect(headers.slice(1, 5)).toEqual(['Nombre', 'Apellido', 'Teléfono', 'Email'])

    const dataRow = sheet.getRow(5).values as unknown[]
    expect(dataRow.slice(1, 5)).toEqual(['Ana', 'Pérez', '555-1234', 'ana@example.com'])
  })

  it('agrega una columna dinámica por cada campo personalizado del evento, en orden, con celdas vacías si el invitado no respondió', async () => {
    const customFields: CustomField[] = [
      { id: 'f1', label: 'Universidad', type: 'text', required: false },
      { id: 'f2', label: 'Instagram', type: 'text', required: false },
    ]
    const event = makeEvent({ customFields })
    const answered = makeGuest({ id: 'g1', customData: { f1: 'UBA', f2: '@ana' } })
    const unanswered = makeGuest({ id: 'g2', name: 'Luis', customData: { f1: 'UNC' } })

    const { workbook } = await buildGuestListWorkbook(event, [answered, unanswered], noLogo)
    const sheet = workbook.worksheets[0]
    const headers = sheet.getRow(4).values as unknown[]
    expect(headers).toContain('Universidad')
    expect(headers).toContain('Instagram')

    const uniIdx = headers.indexOf('Universidad')
    const igIdx = headers.indexOf('Instagram')
    const row1 = sheet.getRow(5).values as unknown[]
    const row2 = sheet.getRow(6).values as unknown[]
    expect(row1[uniIdx]).toBe('UBA')
    expect(row1[igIdx]).toBe('@ana')
    expect(row2[uniIdx]).toBe('UNC')
    expect(row2[igIdx]).toBe('') // no respondió Instagram
  })

  it('desambigua encabezados cuando dos campos personalizados comparten la misma etiqueta', async () => {
    const customFields: CustomField[] = [
      { id: 'f1', label: 'Teléfono extra', type: 'text', required: false },
      { id: 'f2', label: 'Teléfono extra', type: 'text', required: false },
    ]
    const event = makeEvent({ customFields })
    const { workbook } = await buildGuestListWorkbook(event, [makeGuest()], noLogo)
    const headers = (workbook.worksheets[0].getRow(4).values as unknown[]).filter(Boolean)
    expect(headers).toContain('Teléfono extra')
    expect(headers).toContain('Teléfono extra (2)')
  })

  it('no agrega columnas de pago cuando el evento no cobra entrada', async () => {
    const { workbook } = await buildGuestListWorkbook(makeEvent({ requiresPayment: false }), [makeGuest()], noLogo)
    const headers = workbook.worksheets[0].getRow(4).values as unknown[]
    expect(headers).not.toContain('Pago')
    expect(headers).not.toContain('Método de pago')
  })

  it('agrega columnas de pago cuando el evento cobra entrada, con los labels correctos', async () => {
    const event = makeEvent({ requiresPayment: true, paymentMethods: ['transfer'] })
    const guest = makeGuest({ paymentStatus: 'paid', paymentMethod: 'transfer' })
    const { workbook } = await buildGuestListWorkbook(event, [guest], noLogo)
    const sheet = workbook.worksheets[0]
    const headers = sheet.getRow(4).values as unknown[]
    const pagoIdx = headers.indexOf('Pago')
    const metodoIdx = headers.indexOf('Método de pago')
    expect(pagoIdx).toBeGreaterThan(0)
    expect(metodoIdx).toBeGreaterThan(0)
    const row = sheet.getRow(5).values as unknown[]
    expect(row[pagoIdx]).toBe('Pagado')
    expect(row[metodoIdx]).toBe('Transferencia')
  })

  it('muestra "Grupo de N integrantes" y cuenta correcta de personas para invitados isGroup', async () => {
    const guest = makeGuest({
      isGroup: true,
      name: 'Familia Gómez',
      companions: [{ name: 'Uno' }, { name: 'Dos' }, { name: 'Tres' }],
    })
    const { workbook } = await buildGuestListWorkbook(makeEvent(), [guest], noLogo)
    const sheet = workbook.worksheets[0]
    const headers = sheet.getRow(4).values as unknown[]
    const personasIdx = headers.indexOf('Personas')
    const acompanantesIdx = headers.indexOf('Acompañantes')
    const row = sheet.getRow(5).values as unknown[]
    expect(row[personasIdx]).toBe(4) // 1 titular + 3 "acompañantes"
    expect(row[acompanantesIdx]).toBe('Grupo de 4 integrantes')
  })

  it('lista los nombres de los acompañantes de un invitado individual', async () => {
    const guest = makeGuest({ companions: [{ name: 'Bruno', lastName: 'López' }, {}] })
    const { workbook } = await buildGuestListWorkbook(makeEvent(), [guest], noLogo)
    const sheet = workbook.worksheets[0]
    const headers = sheet.getRow(4).values as unknown[]
    const acompanantesIdx = headers.indexOf('Acompañantes')
    const row = sheet.getRow(5).values as unknown[]
    expect(row[acompanantesIdx]).toBe('Bruno López, Acompañante 2')
  })

  it('congela el encabezado y define autoFilter sobre el rango completo de datos', async () => {
    const guests = [makeGuest({ id: 'g1' }), makeGuest({ id: 'g2', name: 'Luis' })]
    const { workbook } = await buildGuestListWorkbook(makeEvent(), guests, noLogo)
    const sheet = workbook.worksheets[0]
    expect(sheet.views).toEqual([{ state: 'frozen', ySplit: 4 }])
    expect(sheet.autoFilter).toEqual({ from: { row: 4, column: 1 }, to: { row: 6, column: expect.any(Number) } })
  })

  it('incluye el nombre del evento en el título y la fecha de exportación en la fila de metadatos', async () => {
    const { workbook } = await buildGuestListWorkbook(makeEvent({ name: 'Cumpleaños de Ana' }), [makeGuest()], noLogo)
    const sheet = workbook.worksheets[0]
    expect(sheet.getCell(1, 2).value).toBe('Cumpleaños de Ana')
    expect(String(sheet.getCell(3, 2).value)).toMatch(/Exportado el/)
  })

  it('reporta progreso por cada invitado y termina "completed"', async () => {
    const onProgress = vi.fn()
    const guests = Array.from({ length: 5 }, (_, i) => makeGuest({ id: `g${i}`, name: `Invitado ${i}` }))
    const { result } = await buildGuestListWorkbook(makeEvent(), guests, { ...noLogo, onProgress })

    expect(result).toBe('completed')
    expect(onProgress).toHaveBeenCalledTimes(5)
    expect(onProgress).toHaveBeenLastCalledWith(5, 5)
  })

  it('se detiene y devuelve "cancelled" si isCancelled ya es true antes de empezar', async () => {
    const guests = [makeGuest()]
    const { result } = await buildGuestListWorkbook(makeEvent(), guests, { ...noLogo, isCancelled: () => true })
    expect(result).toBe('cancelled')
  })
})
