import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MaintenanceGate } from './MaintenanceGate'
import { useAuth } from '../hooks/useAuth'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useMaintenanceMode } from '../hooks/useMaintenanceMode'

vi.mock('../hooks/useAuth')
vi.mock('../hooks/useIsAdmin')
vi.mock('../hooks/useMaintenanceMode')

const mockUseAuth = vi.mocked(useAuth)
const mockUseIsAdmin = vi.mocked(useIsAdmin)
const mockUseMaintenanceMode = vi.mocked(useMaintenanceMode)

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <MaintenanceGate>
              <div>App normal</div>
            </MaintenanceGate>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MaintenanceGate', () => {
  it('mantenimiento desactivado: siempre renderiza la app normal', () => {
    mockUseMaintenanceMode.mockReturnValue({ enabled: false, message: '', updatedAt: null })
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockUseIsAdmin.mockReturnValue({ isAdmin: false, loading: false })

    renderAt('/dashboard')

    expect(screen.getByText('App normal')).toBeInTheDocument()
  })

  it('mantenimiento activado + ruta no exenta + usuario no-admin: muestra la pantalla de mantenimiento', () => {
    mockUseMaintenanceMode.mockReturnValue({ enabled: true, message: '', updatedAt: null })
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockUseIsAdmin.mockReturnValue({ isAdmin: false, loading: false })

    renderAt('/dashboard')

    expect(screen.queryByText('App normal')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Estamos realizando mantenimiento' })).toBeInTheDocument()
  })

  it('mantenimiento activado + /admin: sigue accesible (recuperación del administrador)', () => {
    mockUseMaintenanceMode.mockReturnValue({ enabled: true, message: '', updatedAt: null })
    mockUseAuth.mockReturnValue({ user: { uid: 'admin-1' } as never, loading: false })
    mockUseIsAdmin.mockReturnValue({ isAdmin: true, loading: false })

    renderAt('/admin')

    expect(screen.getByText('App normal')).toBeInTheDocument()
  })

  it('mantenimiento activado + /login: sigue accesible (recuperación de sesión del admin)', () => {
    mockUseMaintenanceMode.mockReturnValue({ enabled: true, message: '', updatedAt: null })
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockUseIsAdmin.mockReturnValue({ isAdmin: false, loading: false })

    renderAt('/login')

    expect(screen.getByText('App normal')).toBeInTheDocument()
  })

  it('mantenimiento activado + pase QR de invitado: sigue accesible', () => {
    mockUseMaintenanceMode.mockReturnValue({ enabled: true, message: '', updatedAt: null })
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockUseIsAdmin.mockReturnValue({ isAdmin: false, loading: false })

    renderAt('/pass/event-1/token-abc')

    expect(screen.getByText('App normal')).toBeInTheDocument()
  })

  it('mantenimiento activado + escáner de check-in: sigue accesible', () => {
    mockUseMaintenanceMode.mockReturnValue({ enabled: true, message: '', updatedAt: null })
    mockUseAuth.mockReturnValue({ user: { uid: 'staff-1' } as never, loading: false })
    mockUseIsAdmin.mockReturnValue({ isAdmin: false, loading: false })

    renderAt('/events/event-1/scan')

    expect(screen.getByText('App normal')).toBeInTheDocument()
  })

  it('mantenimiento activado + usuario admin autenticado en ruta no exenta: nunca queda bloqueado', () => {
    mockUseMaintenanceMode.mockReturnValue({ enabled: true, message: '', updatedAt: null })
    mockUseAuth.mockReturnValue({ user: { uid: 'admin-1' } as never, loading: false })
    mockUseIsAdmin.mockReturnValue({ isAdmin: true, loading: false })

    renderAt('/dashboard')

    expect(screen.getByText('App normal')).toBeInTheDocument()
  })

  it('mantenimiento activado + usuario autenticado NO admin en ruta no exenta: sí queda bloqueado', () => {
    mockUseMaintenanceMode.mockReturnValue({ enabled: true, message: '', updatedAt: null })
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } as never, loading: false })
    mockUseIsAdmin.mockReturnValue({ isAdmin: false, loading: false })

    renderAt('/dashboard')

    expect(screen.queryByText('App normal')).not.toBeInTheDocument()
  })
})
