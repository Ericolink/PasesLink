import { Navigate, Route, Routes } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { Footer } from './components/Footer'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { EventCreate } from './pages/EventCreate'
import { EventCheckout } from './pages/EventCheckout'
import { EventDetail } from './pages/EventDetail'
import { Scanner } from './pages/Scanner'
import { Reports } from './pages/Reports'
import { GuestPass } from './pages/GuestPass'
import { AdminDashboard } from './pages/AdminDashboard'

function App() {
  return (
    <>
      <Navbar />
      <main>
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
      </main>
      <Footer />
    </>
  )
}

export default App
