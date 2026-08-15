import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { AnnouncementProvider } from '../accessibility/LiveRegion'
import { GuestList } from './GuestList'
import type { GuestData } from '../../types'

const hoisted = vi.hoisted(() => ({
  guestsApi: {
    allowGuestReentry: vi.fn().mockResolvedValue(undefined),
    bulkDeleteGuests: vi.fn().mockResolvedValue({ ok: 0, failed: 0 }),
    bulkSetGuestPaymentStatus: vi.fn().mockResolvedValue({ ok: 0, failed: 0 }),
    bulkSetGuestTags: vi.fn().mockResolvedValue({ ok: 0, failed: 0 }),
    deleteGuest: vi.fn().mockResolvedValue(undefined),
    moveGuestToWaitlist: vi.fn().mockResolvedValue(undefined),
    resetGuestRsvp: vi.fn().mockResolvedValue(undefined),
    setGuestPaymentStatus: vi.fn().mockResolvedValue(undefined),
    updateGuest: vi.fn().mockResolvedValue(undefined),
  },
}))

// Mock completo de '../../firebase/guests': GuestList llama directo a las
// acciones masivas/individuales (red real), pero GuestRow/GuestDetailSheet/
// GuestEditForm (montados en el mismo árbol) importan del mismo módulo
// helpers puros (partySize/presentIndicesOf/guestPresence) cuyo resultado sí
// se renderiza — se reimplementan acá en vez de stubearlos, mismo criterio
// que Scanner.test.tsx.
vi.mock('../../firebase/guests', () => ({
  allowGuestReentry: hoisted.guestsApi.allowGuestReentry,
  bulkDeleteGuests: hoisted.guestsApi.bulkDeleteGuests,
  bulkSetGuestPaymentStatus: hoisted.guestsApi.bulkSetGuestPaymentStatus,
  bulkSetGuestTags: hoisted.guestsApi.bulkSetGuestTags,
  deleteGuest: hoisted.guestsApi.deleteGuest,
  moveGuestToWaitlist: hoisted.guestsApi.moveGuestToWaitlist,
  resetGuestRsvp: hoisted.guestsApi.resetGuestRsvp,
  setGuestPaymentStatus: hoisted.guestsApi.setGuestPaymentStatus,
  updateGuest: hoisted.guestsApi.updateGuest,
  GuestVersionConflictError: class GuestVersionConflictError extends Error {},
  partySize: (guest: { companions: unknown[] }) => 1 + guest.companions.length,
  presentIndicesOf: (guest: { status: string; companions: unknown[]; presentIndices?: number[] }) => {
    const total = 1 + guest.companions.length
    if (Array.isArray(guest.presentIndices)) return guest.presentIndices.filter((i) => i >= 0 && i < total)
    return guest.status === 'checked_in' ? Array.from({ length: total }, (_, i) => i) : []
  },
  guestPresence: (guest: { status: string; checkedOutAt: number | null; exitType: string | null }) => {
    if (guest.status !== 'checked_in') return 'invited'
    if (!guest.checkedOutAt) return 'inside'
    return guest.exitType === 'final' ? 'final_out' : 'temp_out'
  },
}))

vi.mock('../../firebase/reports', () => ({
  getGuestCheckins: vi.fn().mockResolvedValue([]),
}))

vi.mock('../../lib/analytics', () => ({
  trackGuestDelete: vi.fn(),
  trackGuestEdit: vi.fn(),
}))

function makeGuest(id: string, overrides: Partial<GuestData> = {}): GuestData {
  return {
    id,
    name: `Invitado ${id}`,
    qrToken: `token-${id}`,
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
    createdAt: Date.now(),
    ...overrides,
  }
}

// searchTerm no vacío fuerza la lista plana (sin agrupar por urgencia ni
// colapsar secciones, ver GuestList.tsx: `hasSearchText`) — hace las
// aserciones deterministas sin depender de qué sección queda expandida por
// default.
function renderGuestList(props: Partial<ComponentProps<typeof GuestList>> = {}) {
  const guests = props.guests ?? [makeGuest('g1'), makeGuest('g2'), makeGuest('g3')]
  return render(
    <AnnouncementProvider>
      <GuestList
        eventId="evt1"
        eventName="Fiesta de prueba"
        guests={guests}
        searchTerm="invitado"
        {...props}
      />
    </AnnouncementProvider>,
  )
}

function getSelectAllGroup() {
  return screen.getByRole('group', { name: 'Selección de invitados' })
}

function getSelectAllCheckbox() {
  return within(getSelectAllGroup()).getByRole('checkbox', { name: 'Seleccionar todos los invitados' }) as HTMLInputElement
}

// La barra flotante de acciones (GuestSelectionBar) repite el mismo texto
// "N seleccionados" cuando count > 0 — se escopea al grupo de arriba para no
// depender de cuál de las dos coincidencias es cada aserción.
function expectSelectedCount(count: number) {
  expect(within(getSelectAllGroup()).getByText(`${count} seleccionado${count === 1 ? '' : 's'}`)).toBeInTheDocument()
}

describe('GuestList — modo selección', () => {
  it('activa el modo selección al presionar "Seleccionar"', async () => {
    const user = userEvent.setup()
    renderGuestList()

    expect(screen.queryByRole('checkbox', { name: 'Seleccionar todos los invitados' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))

    expect(screen.getByRole('button', { name: 'Cancelar selección' })).toBeInTheDocument()
    expect(getSelectAllCheckbox()).toBeInTheDocument()
    expectSelectedCount(0)
  })

  it('selecciona un invitado individual y actualiza el contador', async () => {
    const user = userEvent.setup()
    renderGuestList()
    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))

    await user.click(screen.getByRole('button', { name: /Invitado g1/ }))

    expectSelectedCount(1)
    expect(getSelectAllCheckbox().indeterminate).toBe(true)
    expect(getSelectAllCheckbox().checked).toBe(false)
  })

  it('"Seleccionar todos" selecciona a todos los invitados del contexto actual', async () => {
    const user = userEvent.setup()
    const guests = [makeGuest('g1'), makeGuest('g2'), makeGuest('g3')]
    renderGuestList({ guests })
    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))

    await user.click(getSelectAllCheckbox())

    expectSelectedCount(3)
    expect(getSelectAllCheckbox().checked).toBe(true)
    expect(getSelectAllCheckbox().indeterminate).toBe(false)
  })

  it('"Seleccionar todos" respeta la lista filtrada recibida, no un universo más grande', async () => {
    const user = userEvent.setup()
    // Simula que el padre (EventDetail) ya filtró por búsqueda/estado: acá
    // solo llegan 2 de lo que podría ser un evento con muchos más invitados.
    const filtered = [makeGuest('g1'), makeGuest('g2')]
    renderGuestList({ guests: filtered })
    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))

    await user.click(getSelectAllCheckbox())

    expectSelectedCount(2)
  })

  it('vuelve a tocar "Seleccionar todos" y deselecciona a todos', async () => {
    const user = userEvent.setup()
    renderGuestList()
    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await user.click(getSelectAllCheckbox())
    expectSelectedCount(3)

    await user.click(getSelectAllCheckbox())

    expectSelectedCount(0)
    expect(getSelectAllCheckbox().checked).toBe(false)
    expect(getSelectAllCheckbox().indeterminate).toBe(false)
  })

  it('vuelve a "todos seleccionados" cuando se marca manualmente el último pendiente', async () => {
    const user = userEvent.setup()
    renderGuestList()
    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await user.click(screen.getByRole('button', { name: /Invitado g1/ }))
    await user.click(screen.getByRole('button', { name: /Invitado g2/ }))
    expect(getSelectAllCheckbox().indeterminate).toBe(true)

    await user.click(screen.getByRole('button', { name: /Invitado g3/ }))

    expect(getSelectAllCheckbox().checked).toBe(true)
    expect(getSelectAllCheckbox().indeterminate).toBe(false)
  })

  it('"Cancelar selección" sale del modo selección y limpia lo elegido', async () => {
    const user = userEvent.setup()
    renderGuestList()
    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await user.click(getSelectAllCheckbox())

    // El toggle de arriba y el botón (icon-only) de la barra flotante de
    // acciones comparten el mismo nombre accesible "Cancelar selección" —
    // el primero en orden de documento es el toggle de arriba.
    await user.click(screen.getAllByRole('button', { name: 'Cancelar selección' })[0])

    expect(screen.getByRole('button', { name: 'Seleccionar' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar todos los invitados' })).not.toBeInTheDocument()
  })

  it('una acción masiva (eliminar) limpia la selección y sale del modo selección', async () => {
    const user = userEvent.setup()
    renderGuestList()
    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await user.click(getSelectAllCheckbox())
    expectSelectedCount(3)

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Eliminar invitados' })
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

    expect(hoisted.guestsApi.bulkDeleteGuests).toHaveBeenCalledWith('evt1', expect.arrayContaining([
      expect.objectContaining({ id: 'g1' }),
      expect.objectContaining({ id: 'g2' }),
      expect.objectContaining({ id: 'g3' }),
    ]))
    expect(screen.getByRole('button', { name: 'Seleccionar' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar todos los invitados' })).not.toBeInTheDocument()
  })

  it('poda la selección cuando el conjunto de invitados recibido cambia (invitado ya no está)', async () => {
    const user = userEvent.setup()
    const guests = [makeGuest('g1'), makeGuest('g2'), makeGuest('g3')]
    const { rerender } = renderGuestList({ guests })
    await user.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await user.click(getSelectAllCheckbox())
    expectSelectedCount(3)

    // El padre vuelve a filtrar (o el invitado se eliminó/movió a otra
    // lista) y ahora solo llegan 2 de los 3 que estaban seleccionados.
    rerender(
      <AnnouncementProvider>
        <GuestList
          eventId="evt1"
          eventName="Fiesta de prueba"
          guests={[guests[0], guests[1]]}
          searchTerm="invitado"
        />
      </AnnouncementProvider>,
    )

    expectSelectedCount(2)
  })
})
