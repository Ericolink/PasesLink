import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { Landing } from './pages/Landing'

const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const EventCreate = lazy(() => import('./pages/EventCreate').then((m) => ({ default: m.EventCreate })))
const EventCheckout = lazy(() => import('./pages/EventCheckout').then((m) => ({ default: m.EventCheckout })))
const EventDetail = lazy(() => import('./pages/EventDetail').then((m) => ({ default: m.EventDetail })))
const Scanner = lazy(() => import('./pages/Scanner').then((m) => ({ default: m.Scanner })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const GuestPass = lazy(() => import('./pages/GuestPass').then((m) => ({ default: m.GuestPass })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })))

function PageFallback() {
  return <div className="flex items-center justify-center min-h-screen text-gray-500">Cargando...</div>
}

function App() {
  return (
    <>
      <Navbar />
      <main>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pass/:eventId/:qrToken" element={<GuestPass />} />

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
      </main>
      <Footer />
    </>
  )
}

export default App
