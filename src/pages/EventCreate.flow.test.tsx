import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AnnouncementProvider } from '../components/accessibility/LiveRegion'
import { EventCreate } from './EventCreate'

// Fase 3 del rediseño del wizard: EventCreate ahora persiste en Firestore
// desde el paso 2 en adelante (ver persistProgress), no solo al final. Este
// test verifica la orquestación (createEvent se dispara al salir del paso
// 2, un error no avanza de paso, el diálogo de cancelar cambia de copy una
// vez que el evento ya existe) sin tocar Firebase real — createEvent/
// updateEventDetails van mockeados.

const createEventMock = vi.fn()
const updateEventDetailsMock = vi.fn()

vi.mock('../firebase/events', () => ({
  createEvent: (...args: unknown[]) => createEventMock(...args),
  updateEventDetails: (...args: unknown[]) => updateEventDetailsMock(...args),
}))

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'owner-uid' } }),
}))

vi.mock('../hooks/useCoverPhoto', () => ({
  useCoverPhoto: () => ({
    fileInputRef: { current: null },
    coverImage: '',
    rawImage: null,
    uploading: false,
    error: '',
    openPicker: vi.fn(),
    onFileSelected: vi.fn(),
    onCropConfirmed: vi.fn(),
    onCropCancelled: vi.fn(),
    clearCover: vi.fn(),
    setCoverImage: vi.fn(),
  }),
}))

vi.mock('../hooks/useFormDraft', () => ({
  useFormDraft: () => ({
    pendingDraft: null,
    saveDraft: vi.fn(),
    clearDraft: vi.fn(),
    dismissPrompt: vi.fn(),
    lastSavedAt: null,
  }),
}))

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={['/events/new']}>
      <AnnouncementProvider>
        <EventCreate />
      </AnnouncementProvider>
    </MemoryRouter>,
  )
}

async function fillStep1And2(user: ReturnType<typeof userEvent.setup>) {
  // Paso 1: Tipo de evento — el default ("Controlar acceso") ya alcanza.
  await user.click(screen.getByRole('button', { name: /siguiente/i }))
  // Paso 2: Información básica.
  await user.type(await screen.findByLabelText(/nombre del evento/i), 'Fiesta de prueba')
  await user.type(screen.getByLabelText(/^lugar/i), 'Salón de prueba')
  // El input de fecha nativo (type="date") no tiene id propio en
  // StepBasicInfo (ver EventScheduleField) — se ubica por selector en vez
  // de por label, y se completa con fireEvent porque userEvent.type no
  // maneja bien el formato de <input type="date"> en jsdom.
  const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
  fireEvent.change(dateInput, { target: { value: '2026-12-31' } })
}

describe('EventCreate — persistencia temprana (Fase 3)', () => {
  beforeEach(() => {
    createEventMock.mockReset()
    updateEventDetailsMock.mockReset()
  })

  it('crea el evento en Firestore al salir del paso 2, y avanza al paso 3', async () => {
    createEventMock.mockResolvedValueOnce('new-event-id')
    const user = userEvent.setup()
    renderWizard()

    await fillStep1And2(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))

    await waitFor(() => expect(createEventMock).toHaveBeenCalledTimes(1))
    expect(createEventMock).toHaveBeenCalledWith('owner-uid', expect.objectContaining({ name: 'Fiesta de prueba', location: 'Salón de prueba' }))
    expect(await screen.findByText('Imagen y colores')).toBeInTheDocument()
  })

  it('si falla el guardado, no avanza de paso y muestra el error', async () => {
    createEventMock.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    renderWizard()

    await fillStep1And2(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))

    await waitFor(() => expect(createEventMock).toHaveBeenCalledTimes(1))
    expect(screen.getByText(/no pudimos guardar los cambios/i)).toBeInTheDocument()
    expect(screen.getByText('Información básica')).toBeInTheDocument()
  })

  it('el diálogo de "Cancelar" deja de decir que el evento no se creó, una vez que ya existe', async () => {
    createEventMock.mockResolvedValueOnce('new-event-id')
    const user = userEvent.setup()
    renderWizard()

    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.getByText(/tu evento todavía no se creó/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /seguir editando/i }))

    await fillStep1And2(user)
    await user.click(screen.getByRole('button', { name: /siguiente/i }))
    await waitFor(() => expect(createEventMock).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.getByText(/ya guardamos tu evento/i)).toBeInTheDocument()
  })

  it('"Confirmar cambios" desde el salto de edición en la revisión también persiste, no solo "Publicar"', async () => {
    createEventMock.mockResolvedValueOnce('new-event-id')
    updateEventDetailsMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWizard()

    await fillStep1And2(user)
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: /siguiente/i }))
      await waitFor(() => expect(createEventMock.mock.calls.length + updateEventDetailsMock.mock.calls.length).toBeGreaterThan(i))
    }
    expect(await screen.findByText('Revisión y plantilla')).toBeInTheDocument()

    updateEventDetailsMock.mockClear()
    // Salta a editar "Información básica" (segunda fila) y confirma.
    await user.click(screen.getAllByText('Editar')[1])
    await screen.findByText(/estás editando desde la revisión final/i)
    await user.click(screen.getByRole('button', { name: /confirmar cambios/i }))

    await waitFor(() => expect(updateEventDetailsMock).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Revisión y plantilla')).toBeInTheDocument()
  })
})
