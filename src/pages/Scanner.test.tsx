import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Scanner } from './Scanner'
import { buildPassUrl } from '../utils/qrUrl'
import { AnnouncementProvider } from '../components/accessibility/LiveRegion'
import type { EventData, GuestData } from '../types'

// jsdom no implementa matchMedia — usePrefersReducedMotion/useIsLandscape lo
// llaman directo en el primer render, así que hace falta un stub antes de
// montar el componente (mismo motivo que en cualquier otra pantalla que use
// esos hooks, ninguna otra suite de test lo había necesitado todavía).
window.matchMedia = window.matchMedia || (() => ({
  matches: false,
  media: '',
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}) as unknown as MediaQueryList)

const hoisted = vi.hoisted(() => {
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
      name: 'Invitado',
      qrToken: 'tok1',
      status: 'invited',
      companions: [],
      rsvpStatus: 'yes',
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
  return {
    testEvent: makeEvent(),
    makeGuest,
    qrScanner: {
      onDecode: null as null | ((text: string) => Promise<void>),
      startScanning: vi.fn(),
      stopScanning: vi.fn(),
    },
    guestsApi: {
      checkInGuest: vi.fn(),
      checkOutGuest: vi.fn(),
      confirmPaymentAndCheckIn: vi.fn(),
    },
  }
})

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'owner1' } }),
}))

vi.mock('../hooks/useEventOnly', () => ({
  useEventOnly: () => ({ event: hoisted.testEvent, loading: false, error: null }),
}))

vi.mock('../hooks/useQrScanner', () => ({
  useQrScanner: ({ onDecode }: { onDecode: (text: string) => Promise<void> }) => {
    hoisted.qrScanner.onDecode = onDecode
    return {
      scanning: true,
      cameraError: null,
      startScanning: hoisted.qrScanner.startScanning,
      stopScanning: hoisted.qrScanner.stopScanning,
    }
  },
}))

vi.mock('../firebase/guests', () => ({
  checkInGuest: hoisted.guestsApi.checkInGuest,
  checkOutGuest: hoisted.guestsApi.checkOutGuest,
  confirmPaymentAndCheckIn: hoisted.guestsApi.confirmPaymentAndCheckIn,
  partySize: (guest: { companions: unknown[] }) => 1 + guest.companions.length,
  presentIndicesOf: (guest: { companions: unknown[] }) => Array.from({ length: 1 + guest.companions.length }, (_, i) => i),
}))

vi.mock('../firebase/capacity', () => ({
  walkIn: vi.fn(async () => 'success' as const),
  walkOut: vi.fn(async () => undefined),
}))

vi.mock('../lib/analytics', () => ({
  trackCheckIn: vi.fn(),
  trackCheckOut: vi.fn(),
}))

vi.mock('../lib/sentry', () => ({
  captureException: vi.fn(),
}))

vi.mock('canvas-confetti', () => ({ default: vi.fn() }))

function renderScanner() {
  return render(
    <AnnouncementProvider>
      <MemoryRouter initialEntries={['/events/evt1/scan']}>
        <Routes>
          <Route path="/events/:eventId/scan" element={<Scanner />} />
        </Routes>
      </MemoryRouter>
    </AnnouncementProvider>,
  )
}

async function scan(qrToken: string) {
  const onDecode = hoisted.qrScanner.onDecode
  if (!onDecode) throw new Error('useQrScanner mock: onDecode no se registró — ¿se llamó a renderScanner()?')
  await act(async () => {
    await onDecode(buildPassUrl('evt1', qrToken))
  })
}

describe('Scanner — pantalla de resultado', () => {
  beforeEach(() => {
    // Los mocks de vi.hoisted son de módulo (compartidos entre tests) — sin
    // esto, los conteos de llamadas y las respuestas encoladas de un test se
    // filtran al siguiente.
    hoisted.guestsApi.checkInGuest.mockReset()
    hoisted.guestsApi.checkOutGuest.mockReset()
    hoisted.guestsApi.confirmPaymentAndCheckIn.mockReset()
    hoisted.qrScanner.onDecode = null
    hoisted.qrScanner.startScanning.mockClear()
    hoisted.qrScanner.stopScanning.mockClear()
  })

  it('el check-in exitoso permanece visible sin importar cuánto tiempo pase, hasta presionar "Cerrar"', async () => {
    hoisted.guestsApi.checkInGuest.mockResolvedValueOnce({
      status: 'success',
      guest: hoisted.makeGuest({ name: 'Juan' }),
      reentry: false,
      partial: false,
      addedCount: 1,
    })
    renderScanner()

    await scan('tok1')

    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByText('Juan')).toBeInTheDocument()

    // Muy por encima del antiguo auto-cierre (3500ms) — la pantalla de éxito
    // ya no tiene timer que la cierre sola. Timers reales (no fake): fake
    // timers + el scheduler de React 19 en jsdom se trababan en este test.
    await new Promise((resolve) => setTimeout(resolve, 3800))
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByText('Juan')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }, 8000)

  it('cerrar el resultado exitoso deja el scanner listo de inmediato, sin reiniciar la cámara ni pisar un check-in con el siguiente', async () => {
    hoisted.guestsApi.checkInGuest.mockResolvedValueOnce({
      status: 'success',
      guest: hoisted.makeGuest({ name: 'Ana' }),
      reentry: false,
      partial: false,
      addedCount: 1,
    })
    renderScanner()

    await scan('tok1')
    expect(await screen.findByText('Ana')).toBeInTheDocument()
    expect(hoisted.guestsApi.checkInGuest).toHaveBeenCalledTimes(1)

    // Un frame de cámara de fondo con otro QR mientras el resultado sigue
    // abierto no debe procesarse (evita escaneos accidentales, ver
    // feedbackRef en Scanner.tsx).
    await scan('tok2')
    expect(hoisted.guestsApi.checkInGuest).toHaveBeenCalledTimes(1)

    hoisted.guestsApi.checkInGuest.mockResolvedValueOnce({
      status: 'success',
      guest: hoisted.makeGuest({ name: 'Beto' }),
      reentry: false,
      partial: false,
      addedCount: 1,
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // La cámara sigue el mismo stream: cerrar el resultado no la para ni la
    // vuelve a arrancar.
    expect(hoisted.qrScanner.startScanning).not.toHaveBeenCalled()
    expect(hoisted.qrScanner.stopScanning).not.toHaveBeenCalled()

    await scan('tok2')
    expect(await screen.findByText('Beto')).toBeInTheDocument()
    expect(hoisted.guestsApi.checkInGuest).toHaveBeenCalledTimes(2)
  })

  it('un QR ya escaneado no se autocierra y deja elegir si el invitado regresa o se retira (reemplaza al escáner de salida)', async () => {
    const user = userEvent.setup()
    hoisted.guestsApi.checkInGuest.mockResolvedValueOnce({
      status: 'already_checked_in',
      guest: hoisted.makeGuest({ name: 'Carla', checkedInAt: Date.now(), checkedInByEmail: 'staff@evento.com' }),
    })
    renderScanner()

    await scan('tok3')
    expect(await screen.findByText('Carla')).toBeInTheDocument()
    expect(screen.getByText(/qr ya registrado/i)).toBeInTheDocument()

    // Este resultado ya no se autocerraba antes del cambio tampoco — se
    // conserva ese comportamiento (timers reales, ver comentario del test
    // anterior sobre por qué no se usan fake timers acá).
    await new Promise((resolve) => setTimeout(resolve, 3800))
    expect(screen.getByText('Carla')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /salió del evento/i }))
    const exitDialog = await screen.findByRole('alertdialog')
    expect(within(exitDialog).getByText('Carla')).toBeInTheDocument()

    hoisted.guestsApi.checkOutGuest.mockResolvedValueOnce({
      status: 'success',
      guest: hoisted.makeGuest({ name: 'Carla' }),
      kind: 'temporary',
    })
    await user.click(within(exitDialog).getByRole('button', { name: 'Volverá' }))

    expect(await screen.findByText(/hasta luego/i)).toBeInTheDocument()
    expect(hoisted.guestsApi.checkOutGuest).toHaveBeenCalledWith('evt1', 'tok3', 'temporary')
  }, 8000)

  it('ya no existe un modo/botón de "Escáner de salida" separado en la interfaz', () => {
    renderScanner()
    expect(screen.queryByRole('button', { name: /^salida$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^entrada$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/escáner de salida/i)).not.toBeInTheDocument()
    // Una sola instancia de cámara — no hay un segundo scanner de salida.
    expect(document.querySelectorAll('#qr-reader')).toHaveLength(1)
  })
})
