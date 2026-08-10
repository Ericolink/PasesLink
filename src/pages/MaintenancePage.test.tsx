import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Timestamp } from 'firebase/firestore'
import { MaintenancePage } from './MaintenancePage'
import { checkA11y } from '../test/axe'

function fakeTimestamp(date: Date): Timestamp {
  return { toDate: () => date } as Timestamp
}

describe('MaintenancePage', () => {
  const originalReload = window.location.reload

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: { ...window.location, reload: originalReload }, writable: true })
    vi.useRealTimers()
  })

  it('no tiene violaciones de accesibilidad', async () => {
    render(<MaintenancePage />)
    await checkA11y(document.body)
  })

  it('muestra el heading principal y el copy por defecto', () => {
    render(<MaintenancePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Estamos realizando mantenimiento' })).toBeInTheDocument()
    expect(screen.getByText(/temporalmente fuera de servicio/i)).toBeInTheDocument()
  })

  it('usa el mensaje personalizado cuando se provee', () => {
    render(<MaintenancePage message="Migrando la base de datos, ya casi terminamos." />)
    expect(screen.getByText('Migrando la base de datos, ya casi terminamos.')).toBeInTheDocument()
  })

  it('no muestra "Última actualización" sin un updatedAt', () => {
    render(<MaintenancePage />)
    expect(screen.queryByText(/Última actualización/)).not.toBeInTheDocument()
  })

  it('muestra "Última actualización" cuando hay updatedAt', () => {
    render(<MaintenancePage updatedAt={fakeTimestamp(new Date('2026-08-10T10:42:00'))} />)
    expect(screen.getByText(/Última actualización/)).toBeInTheDocument()
  })

  it('el botón "Intentar nuevamente" recarga la página', async () => {
    const user = userEvent.setup()
    render(<MaintenancePage />)

    await user.click(screen.getByRole('button', { name: 'Intentar nuevamente' }))

    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1), { timeout: 1000 })
  })

  it('deshabilita el botón mientras reintenta, sin permitir reintentos encadenados', async () => {
    const user = userEvent.setup()
    render(<MaintenancePage />)

    const button = screen.getByRole('button', { name: 'Intentar nuevamente' })
    await user.click(button)
    await user.click(button)

    await waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1), { timeout: 1000 })
  })
})
