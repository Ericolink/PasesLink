import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { useAuth } from '../hooks/useAuth'
import { useSanctionStatus } from '../hooks/useSanctionStatus'
import { useUserProfile } from '../hooks/useUserProfile'
import { LEGAL_DOCS } from '../legal/documents'

vi.mock('../hooks/useAuth')
vi.mock('../hooks/useSanctionStatus')
vi.mock('../hooks/useUserProfile')
vi.mock('../firebase/legalAcceptance', () => ({ recordLegalAcceptance: vi.fn() }))
vi.mock('../firebase/auth', () => ({ logout: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)
const mockUseSanctionStatus = vi.mocked(useSanctionStatus)
const mockUseUserProfile = vi.mocked(useUserProfile)

const CURRENT_VERSIONS = { terms: LEGAL_DOCS.terms.version, privacy: LEGAL_DOCS.privacy.version }
const STALE_VERSIONS = { terms: '2020-01-01', privacy: '2020-01-01' }

const EMPTY_SUMMARY = { uid: '', warningsCount: 0, global: { bannedUntil: 0, commentBanUntil: 0, photoBanUntil: 0, reason: '' }, events: {}, updatedAt: 0 }

const NOT_BANNED: ReturnType<typeof useSanctionStatus> = {
  summary: EMPTY_SUMMARY,
  banned: false,
  commentBlocked: false,
  photoBlocked: false,
  banMessage: null,
  commentBlockedMessage: null,
  photoBlockedMessage: null,
}

// Ruta "/login" real en el árbol: sin usuario, ProtectedRoute renderiza
// <Navigate to="/login">. Con un único <Route path="*"> (sin distinguir
// destino), esa navegación vuelve a matchear el mismo comodín y a
// re-evaluar ProtectedRoute con el mismo resultado — bucle infinito de
// redirect que nunca termina de renderizar. La app real no tiene este
// problema porque /login es una ruta propia y distinta; acá hay que
// replicarlo para que el caso "sin usuario" pueda resolver de verdad.
function renderAt(path: string, routePath = '*') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Pantalla de login</div>} />
        <Route
          path={routePath}
          element={
            <ProtectedRoute>
              <div>Contenido protegido</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute — gate de re-aceptación legal', () => {
  it('sin usuario: redirige a /login (no evalúa el gate legal)', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false })
    mockUseSanctionStatus.mockReturnValue(NOT_BANNED)
    mockUseUserProfile.mockReturnValue({ profile: null, loadingProfile: false })

    renderAt('/dashboard')

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(screen.getByText('Pantalla de login')).toBeInTheDocument()
  })

  it('perfil aún cargando: no bloquea (fail-open), muestra el contenido', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } as never, loading: false })
    mockUseSanctionStatus.mockReturnValue(NOT_BANNED)
    mockUseUserProfile.mockReturnValue({ profile: null, loadingProfile: true })

    renderAt('/dashboard')

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it('con las versiones vigentes ya aceptadas: muestra el contenido normal', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } as never, loading: false })
    mockUseSanctionStatus.mockReturnValue(NOT_BANNED)
    mockUseUserProfile.mockReturnValue({
      profile: { legalAcceptedVersions: CURRENT_VERSIONS } as never,
      loadingProfile: false,
    })

    renderAt('/dashboard')

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it('con una versión desactualizada: muestra la pantalla de re-aceptación en vez del contenido', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } as never, loading: false })
    mockUseSanctionStatus.mockReturnValue(NOT_BANNED)
    mockUseUserProfile.mockReturnValue({
      profile: { legalAcceptedVersions: STALE_VERSIONS } as never,
      loadingProfile: false,
    })

    renderAt('/dashboard')

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Actualizamos nuestros documentos legales' })).toBeInTheDocument()
  })

  it('nunca aceptó nada (cuenta anterior al sistema de consentimiento): también pide re-aceptar', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } as never, loading: false })
    mockUseSanctionStatus.mockReturnValue(NOT_BANNED)
    mockUseUserProfile.mockReturnValue({ profile: { } as never, loadingProfile: false })

    renderAt('/dashboard')

    expect(screen.getByRole('heading', { name: 'Actualizamos nuestros documentos legales' })).toBeInTheDocument()
  })

  it('escáner de check-in (/events/:eventId/scan): exento del gate aunque haya versión pendiente', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'staff-1' } as never, loading: false })
    mockUseSanctionStatus.mockReturnValue(NOT_BANNED)
    mockUseUserProfile.mockReturnValue({
      profile: { legalAcceptedVersions: STALE_VERSIONS } as never,
      loadingProfile: false,
    })

    renderAt('/events/event-1/scan', '/events/:eventId/scan')

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it('completar perfil (/complete-profile): exento del gate — esa pantalla ya pide aceptar por su cuenta', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } as never, loading: false })
    mockUseSanctionStatus.mockReturnValue(NOT_BANNED)
    mockUseUserProfile.mockReturnValue({ profile: { } as never, loadingProfile: false })

    renderAt('/complete-profile', '/complete-profile')

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it('una sanción global bloquea incluso antes de evaluar el gate legal', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } as never, loading: false })
    mockUseSanctionStatus.mockReturnValue({ ...NOT_BANNED, banned: true, banMessage: 'Suspendido por 3 días.' })
    mockUseUserProfile.mockReturnValue({
      profile: { legalAcceptedVersions: CURRENT_VERSIONS } as never,
      loadingProfile: false,
    })

    renderAt('/dashboard')

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cuenta suspendida' })).toBeInTheDocument()
  })
})
