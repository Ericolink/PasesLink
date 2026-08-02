import { Suspense, lazy } from 'react'
import { Navigate, Route, useParams } from 'react-router-dom'
import { SentryRoutes } from './lib/sentry'
import { Background } from './components/Background'
import { ErrorBoundary } from './components/ErrorBoundary'
import { RouteAnnouncer } from './components/accessibility/RouteAnnouncer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { CrownLoader } from './components/CrownLoader'
import { PublicLayout } from './components/PublicLayout'
import { BrowseLayout } from './components/BrowseLayout'
import { AppShell } from './components/AppShell'
import { Landing } from './pages/Landing'
import { NotFound } from './pages/NotFound'

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })))
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })))
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })))
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const EventCreate = lazy(() => import('./pages/EventCreate').then((m) => ({ default: m.EventCreate })))
const EventDetail = lazy(() => import('./pages/EventDetail').then((m) => ({ default: m.EventDetail })))
const Scanner = lazy(() => import('./pages/Scanner').then((m) => ({ default: m.Scanner })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const GuestPass = lazy(() => import('./pages/GuestPass').then((m) => ({ default: m.GuestPass })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })))
const EventArrive = lazy(() => import('./pages/EventArrive').then((m) => ({ default: m.EventArrive })))
const EventJoin = lazy(() => import('./pages/EventJoin').then((m) => ({ default: m.EventJoin })))
const WaitlistStatus = lazy(() => import('./pages/WaitlistStatus').then((m) => ({ default: m.WaitlistStatus })))
const EventWall = lazy(() => import('./pages/EventWall').then((m) => ({ default: m.EventWall })))
const CompleteProfile = lazy(() => import('./pages/CompleteProfile').then((m) => ({ default: m.CompleteProfile })))
const MyInvitations   = lazy(() => import('./pages/MyInvitations').then((m) => ({ default: m.MyInvitations })))
const Feedback        = lazy(() => import('./pages/Feedback').then((m) => ({ default: m.Feedback })))
const SeatingChart    = lazy(() => import('./pages/SeatingChart').then((m) => ({ default: m.SeatingChart })))
const HostLive        = lazy(() => import('./pages/HostLive').then((m) => ({ default: m.HostLive })))
const ConcessionsManager = lazy(() => import('./pages/ConcessionsManager').then((m) => ({ default: m.ConcessionsManager })))
const ConcessionsKitchen = lazy(() => import('./pages/ConcessionsKitchen').then((m) => ({ default: m.ConcessionsKitchen })))
const MyCommunityTemplates    = lazy(() => import('./pages/MyCommunityTemplates').then((m) => ({ default: m.MyCommunityTemplates })))
const SubmitCommunityTemplate = lazy(() => import('./pages/SubmitCommunityTemplate').then((m) => ({ default: m.SubmitCommunityTemplate })))

function PageFallback() {
  return <CrownLoader className="min-h-[60vh]" />
}

// EventDetail/Reports/Scanner comparten ruta con :eventId variable — React
// Router reusa la misma instancia del componente al navegar de un evento a
// otro (mismo tipo de elemento, solo cambia el param), así que useEventOnly/
// useEvent (suscripción a Firestore, no resetean `event` al cambiar
// eventId) siguen mostrando datos del evento anterior — nombre, invitados y
// también templateId/accentColor — hasta que llega el primer snapshot del
// evento nuevo. `key={eventId}` fuerza un remount limpio en cada cambio de
// evento en vez de dejar que el estado (incluido el tema del dashboard) se
// filtre de un evento al siguiente.
function EventDetailRoute() {
  const { eventId } = useParams()
  return <BrowseLayout><EventDetail key={eventId} /></BrowseLayout>
}
function ReportsRoute() {
  const { eventId } = useParams()
  return <BrowseLayout><Reports key={eventId} /></BrowseLayout>
}
function ScannerRoute() {
  const { eventId } = useParams()
  return <AppShell mode="kiosk"><Scanner key={eventId} /></AppShell>
}
function SeatingChartRoute() {
  const { eventId } = useParams()
  return <BrowseLayout><SeatingChart key={eventId} /></BrowseLayout>
}
function HostLiveRoute() {
  const { eventId } = useParams()
  return <AppShell mode="display"><HostLive key={eventId} /></AppShell>
}
function ConcessionsManagerRoute() {
  const { eventId } = useParams()
  return <BrowseLayout><ConcessionsManager key={eventId} /></BrowseLayout>
}
function ConcessionsKitchenRoute() {
  const { eventId } = useParams()
  return <BrowseLayout><ConcessionsKitchen key={eventId} /></BrowseLayout>
}

function App() {
  return (
    <>
      <Background />
      <RouteAnnouncer />
      <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
      <SentryRoutes>
        {/* Público: marketing, legal, auth — Navbar + Footer */}
        <Route path="/" element={<PublicLayout><Landing /></PublicLayout>} />
        <Route path="/login" element={<PublicLayout><Login /></PublicLayout>} />
        <Route path="/register" element={<PublicLayout><Register /></PublicLayout>} />
        <Route path="/forgot-password" element={<PublicLayout><ForgotPassword /></PublicLayout>} />
        <Route path="/reset-password" element={<PublicLayout><ResetPassword /></PublicLayout>} />
        <Route path="/terminos" element={<PublicLayout><Terms /></PublicLayout>} />
        <Route path="/privacidad" element={<PublicLayout><Privacy /></PublicLayout>} />
        <Route path="/feedback" element={<PublicLayout><Feedback /></PublicLayout>} />

        {/* Kiosko público: pases y flujos de invitado, sin chrome de marketing.
            guestExit: a diferencia del Scanner (abajo), estas pantallas se
            llegan mayormente sin sesión, pero un visitante que ya tiene
            cuenta (o la acaba de crear desde el propio pase) necesita una
            salida — ver el comentario de AppShell. */}
        <Route path="/pass/:eventId/:qrToken" element={<AppShell mode="kiosk" guestExit><GuestPass /></AppShell>} />
        <Route path="/events/:id/arrive" element={<AppShell mode="kiosk" guestExit><EventArrive /></AppShell>} />
        <Route path="/events/:id/join" element={<AppShell mode="kiosk" guestExit><EventJoin /></AppShell>} />
        <Route path="/events/:id/wall" element={<AppShell mode="kiosk" guestExit><EventWall /></AppShell>} />
        {/* Alias corto de /events/:id/join para compartir en redes (ver
            ShareEventButton.tsx) — EventJoin no depende del prefijo de ruta. */}
        <Route path="/e/:id" element={<AppShell mode="kiosk" guestExit><EventJoin /></AppShell>} />
        {/* Estado de una entrada de lista de espera, acceso por ?token= (ver
            WAITLIST_RECONFIRMATION_ARCHITECTURE.md §3.2). */}
        <Route path="/waitlist/:eventId" element={<AppShell mode="kiosk" guestExit><WaitlistStatus /></AppShell>} />

        {/* Modo navegación: Inicio, Invitaciones, Perfil y sus drill-downs */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <BrowseLayout><Dashboard /></BrowseLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId"
          element={
            <ProtectedRoute>
              <EventDetailRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId/reports"
          element={
            <ProtectedRoute>
              <ReportsRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId/seating"
          element={
            <ProtectedRoute>
              <SeatingChartRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId/live"
          element={
            <ProtectedRoute>
              <HostLiveRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId/menu"
          element={
            <ProtectedRoute>
              <ConcessionsManagerRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId/kitchen"
          element={
            <ProtectedRoute>
              <ConcessionsKitchenRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <BrowseLayout><Profile /></BrowseLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-invitations"
          element={
            <ProtectedRoute>
              <BrowseLayout><MyInvitations /></BrowseLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-templates"
          element={
            <ProtectedRoute>
              <BrowseLayout><MyCommunityTemplates /></BrowseLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-templates/new"
          element={
            <ProtectedRoute>
              <AppShell mode="focus"><SubmitCommunityTemplate /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-templates/:id/edit"
          element={
            <ProtectedRoute>
              <AppShell mode="focus"><SubmitCommunityTemplate /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <BrowseLayout><AdminDashboard /></BrowseLayout>
            </AdminRoute>
          }
        />

        {/* Modo foco: tareas de varios pasos, sin barra inferior */}
        <Route
          path="/events/new"
          element={
            <ProtectedRoute>
              <AppShell mode="focus"><EventCreate /></AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/complete-profile"
          element={
            <ProtectedRoute>
              <AppShell mode="focus"><CompleteProfile /></AppShell>
            </ProtectedRoute>
          }
        />

        {/* Modo kiosko autenticado: escaneo en la puerta */}
        <Route
          path="/events/:eventId/scan"
          element={
            <ProtectedRoute>
              <ScannerRoute />
            </ProtectedRoute>
          }
        />

        {/* Duplicado de Inicio, fusionado — ver fase 2 del rediseño de navegación */}
        <Route path="/my-events" element={<Navigate to="/dashboard" replace />} />

        <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
      </SentryRoutes>
      </Suspense>
      </ErrorBoundary>
    </>
  )
}

export default App
