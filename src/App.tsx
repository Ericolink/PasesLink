import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { Landing } from './pages/Landing'

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })))
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })))
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))
const Terms = lazy(() => import('./pages/Terms').then((m) => ({ default: m.Terms })))
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const EventCreate = lazy(() => import('./pages/EventCreate').then((m) => ({ default: m.EventCreate })))
const EventCheckout = lazy(() => import('./pages/EventCheckout').then((m) => ({ default: m.EventCheckout })))
const EventDetail = lazy(() => import('./pages/EventDetail').then((m) => ({ default: m.EventDetail })))
const Scanner = lazy(() => import('./pages/Scanner').then((m) => ({ default: m.Scanner })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const GuestPass = lazy(() => import('./pages/GuestPass').then((m) => ({ default: m.GuestPass })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })))
const EventArrive = lazy(() => import('./pages/EventArrive').then((m) => ({ default: m.EventArrive })))
const EventJoin = lazy(() => import('./pages/EventJoin').then((m) => ({ default: m.EventJoin })))

function PageFallback() {
  return <div className="flex items-center justify-center min-h-screen text-gray-500">Cargando...</div>
}

function App() {
  return (
    <>
      <Navbar />
      <main>
      <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terminos" element={<Terms />} />
        <Route path="/privacidad" element={<Privacy />} />
        <Route path="/pass/:eventId/:qrToken" element={<GuestPass />} />
        <Route path="/events/:id/arrive" element={<EventArrive />} />
        <Route path="/events/:id/join" element={<EventJoin />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/new"
          element={
            <ProtectedRoute>
              <EventCreate />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId/checkout"
          element={
            <ProtectedRoute>
              <EventCheckout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId"
          element={
            <ProtectedRoute>
              <EventDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId/scan"
          element={
            <ProtectedRoute>
              <Scanner />
            </ProtectedRoute>
          }
        />
        <Route
          path="/events/:eventId/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      </main>
      <Footer />
    </>
  )
}

export default App
