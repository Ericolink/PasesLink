import { describe, expect, it, vi } from 'vitest'
import { exportGuestPassesPdf } from './exportPdf'
import type { EventData, GuestData } from '../types'

const save = vi.fn()

vi.mock('jspdf', () => ({
  __esModule: true,
  // Función regular (no arrow): se invoca con `new jsPDF(...)`, y los arrow
  // functions no son construibles en JS.
  default: vi.fn().mockImplementation(function FakeJsPdf() {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      addPage: vi.fn(),
      setFontSize: vi.fn(),
      text: vi.fn(),
      addImage: vi.fn(),
      setTextColor: vi.fn(),
      save,
    }
  }),
}))

vi.mock('qrcode', () => ({
  __esModule: true,
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fake') },
}))

function makeEvent(): EventData {
  return {
    id: 'evt1',
    ownerId: 'owner1',
    name: 'Fiesta de prueba',
    date: '2026-01-01',
    location: 'Algún lugar',
    entryMode: 'list',
    capacity: 100,
    requiresPayment: false,
    ticketPrice: 0,
    currency: '',
    paymentInstructions: '',
    plan: 'premium',
    paymentStatus: 'paid',
    status: 'active',
    guestCount: 0,
    checkedInCount: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

function makeGuests(count: number): GuestData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `g${i}`,
    name: `Invitado ${i}`,
    qrToken: `token${i}`,
    status: 'invited',
    companions: [],
    rsvpStatus: 'pending',
    checkedInAt: null,
    checkedInBy: null,
    checkedInByEmail: null,
    checkedOutAt: null,
    checkedOutByEmail: null,
    lockToken: null,
    paymentStatus: 'unpaid',
    createdAt: 0,
  }))
}

describe('exportGuestPassesPdf', () => {
  it('reports progress for every guest and completes', async () => {
    const onProgress = vi.fn()
    const result = await exportGuestPassesPdf(makeEvent(), makeGuests(40), { onProgress })

    expect(result).toBe('completed')
    expect(onProgress).toHaveBeenCalledTimes(40)
    expect(onProgress).toHaveBeenLastCalledWith(40, 40)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('stops early and skips save() when cancelled mid-generation', async () => {
    save.mockClear()
    const onProgress = vi.fn()
    let cancelled = false
    // Cancela apenas se generó la primera página — simula al usuario haciendo
    // click en "Cancelar" durante una exportación grande.
    const result = await exportGuestPassesPdf(makeEvent(), makeGuests(100), {
      onProgress,
      isCancelled: () => {
        const shouldCancel = cancelled
        cancelled = onProgress.mock.calls.length >= 1
        return shouldCancel
      },
    })

    expect(result).toBe('cancelled')
    expect(save).not.toHaveBeenCalled()
    expect(onProgress.mock.calls.length).toBeLessThan(100)
  })

  it('does not call save() when already cancelled before starting', async () => {
    save.mockClear()
    const result = await exportGuestPassesPdf(makeEvent(), makeGuests(10), {
      isCancelled: () => true,
    })

    expect(result).toBe('cancelled')
    expect(save).not.toHaveBeenCalled()
  })
})
