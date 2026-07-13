import { describe, expect, it } from 'vitest'
import { parseGuestsCsv } from './csvImport'

describe('parseGuestsCsv', () => {
  it('parses a comma-separated CSV with name/lastName/phone/email columns', () => {
    const csv = 'Nombre,Apellido,Telefono,Email\nJuan,Pérez,11-2222-3333,juan@test.com\nMaría,López,,maria@test.com'
    const result = parseGuestsCsv(csv)

    expect(result.headerError).toBeNull()
    expect(result.rowErrors).toEqual([])
    expect(result.rows).toEqual([
      { name: 'Juan', lastName: 'Pérez', phone: '11-2222-3333', email: 'juan@test.com' },
      { name: 'María', lastName: 'López', phone: undefined, email: 'maria@test.com' },
    ])
  })

  it('detects semicolon-delimited CSV (common regional Excel export)', () => {
    const csv = 'Nombre;Apellido\nAna;Gómez'
    const result = parseGuestsCsv(csv)

    expect(result.rows).toEqual([{ name: 'Ana', lastName: 'Gómez', phone: undefined, email: undefined }])
  })

  it('matches header aliases case-insensitively and ignoring accents', () => {
    const csv = 'NAME,last name,TELÉFONO\nJuan,Pérez,123'
    const result = parseGuestsCsv(csv)

    expect(result.rows).toEqual([{ name: 'Juan', lastName: 'Pérez', phone: '123', email: undefined }])
  })

  it('handles quoted fields containing the delimiter', () => {
    const csv = 'Nombre,Apellido\n"Pérez, Juan","García Muñoz"'
    const result = parseGuestsCsv(csv)

    expect(result.rows).toEqual([{ name: 'Pérez, Juan', lastName: 'García Muñoz', phone: undefined, email: undefined }])
  })

  it('reports a headerError when no name column can be found', () => {
    const csv = 'Telefono,Email\n123,a@test.com'
    const result = parseGuestsCsv(csv)

    expect(result.headerError).not.toBeNull()
    expect(result.rows).toEqual([])
  })

  it('skips rows without a name and reports them as row errors', () => {
    const csv = 'Nombre,Apellido\nJuan,Pérez\n,SinNombre'
    const result = parseGuestsCsv(csv)

    expect(result.rows).toEqual([{ name: 'Juan', lastName: 'Pérez', phone: undefined, email: undefined }])
    expect(result.rowErrors).toEqual([{ line: 3, message: 'Fila sin nombre — se omitió.' }])
  })

  it('returns a headerError for an empty file', () => {
    expect(parseGuestsCsv('').headerError).not.toBeNull()
    expect(parseGuestsCsv('   ').headerError).not.toBeNull()
  })
})
