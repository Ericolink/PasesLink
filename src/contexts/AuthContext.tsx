import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../firebase/config'
import { setSentryUser } from '../lib/sentry'

interface AuthContextValue {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Única suscripción onAuthStateChanged de toda la app. Antes useAuth() era un
// hook plano (su propio useState + su propia suscripción), llamado de forma
// independiente en ~27 archivos — en una sola pantalla (ej. /events/:id con
// el muro visible) eso llegaba a montar hasta 8 listeners onAuthStateChanged
// y 8 copias de estado `user` a la vez (ProtectedRoute, useSanctionStatus
// dentro de ProtectedRoute, Navbar, BottomTabBar, EventDetail, WallSection,
// useUserProfile y useSanctionStatus dentro de WallSection), cada una
// resolviendo su primer snapshot por separado. Un solo AuthProvider en la
// raíz colapsa eso a 1 listener — todos los consumidores ven exactamente el
// mismo `user`/`loading` en el mismo instante, sin ventana de inconsistencia
// transitoria entre componentes de una misma pantalla.
export function AuthProvider({ children }: { children: ReactNode }) {
  // Inicializar desde auth.currentUser (no null) evita un "flash" de sesión
  // cerrada al montar — onAuthStateChanged siempre dispara su primer
  // callback de forma asíncrona, incluso si Firebase ya conoce al usuario.
  const [user, setUser] = useState<User | null>(() => auth.currentUser)
  const [loading, setLoading] = useState(() => !auth.currentUser)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)
      setSentryUser(currentUser ? { uid: currentUser.uid, email: currentUser.email } : null)
    })
    return unsubscribe
  }, [])

  const value = useMemo(() => ({ user, loading }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook colocado a propósito junto a su Provider (patrón estándar de
// Context); no vale la pena partir el archivo en 2 por esta regla de
// Fast Refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext (useAuth) debe usarse dentro de <AuthProvider>')
  return ctx
}
