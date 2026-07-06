import { describe, expect, it } from 'vitest'
import { attendancePercent } from './attendance'
import { partySize } from '../firebase/guests'

describe('attendancePercent', () => {
  it('regresa 0 cuando expected es 0 o negativo (evento sin invitados)', () => {
    expect(attendancePercent(0, 0)).toBe(0)
    expect(attendancePercent(5, 0)).toBe(0)
    expect(attendancePercent(0, -1)).toBe(0)
  })

  it('regresa 0 cuando no hay nadie presente (evento sin asistentes)', () => {
    expect(attendancePercent(0, 25)).toBe(0)
  })

  it('calcula el porcentaje normal (evento parcialmente asistido)', () => {
    expect(attendancePercent(4, 25)).toBeCloseTo(16, 5)
  })

  it('nunca supera 100% (evento completamente lleno o sobre-asistido)', () => {
    expect(attendancePercent(25, 25)).toBe(100)
    expect(attendancePercent(30, 25)).toBe(100)
  })

  it('nunca es negativo', () => {
    expect(attendancePercent(-3, 25)).toBe(0)
  })

  // Caso reportado como bug crítico: 1 invitación con 3 acompañantes (4
  // personas) escaneada de una invitación de 10 con 25 personas esperadas en
  // total no debe mostrar 400% (checkedInCount/guestCount) sino ~16%
  // (checkedInCount/peopleCount).
  it('no confunde conteo de invitaciones con conteo de personas', () => {
    const guestCount = 10
    const peopleCount = 25
    const scannedInvitation = { companions: [{}, {}, {}] } // titular + 3 acompañantes
    const checkedInCount = partySize(scannedInvitation) // 4 personas

    expect(checkedInCount).toBe(4)
    expect(Math.round(attendancePercent(checkedInCount, peopleCount))).toBe(16)
    // La fórmula incorrecta (dividir por guestCount) es la que producía 400%.
    expect(Math.round((checkedInCount / guestCount) * 100)).toBe(40)
  })
})

describe('partySize', () => {
  it('invitado individual sin acompañantes cuenta como 1 persona', () => {
    expect(partySize({ companions: [] })).toBe(1)
  })

  it('invitado con 1 acompañante cuenta como 2 personas', () => {
    expect(partySize({ companions: [{}] })).toBe(2)
  })

  it('familia de varios integrantes cuenta a todos', () => {
    expect(partySize({ companions: [{}, {}, {}, {}] })).toBe(5)
  })

  it('varias familias con distinta cantidad de integrantes suman correctamente', () => {
    const guests = [
      { companions: [] }, // 1
      { companions: [{}] }, // 2
      { companions: [{}, {}, {}] }, // 4
    ]
    const total = guests.reduce((sum, g) => sum + partySize(g), 0)
    expect(total).toBe(7)
  })
})
