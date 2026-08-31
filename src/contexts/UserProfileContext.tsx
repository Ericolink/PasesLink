import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuthContext } from './AuthContext'
import { withListenerReporting } from '../lib/sentry'
import type { UserProfile } from '../types'

interface UserProfileContextValue {
  profile: UserProfile | null
  loadingProfile: boolean
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null)

// Antes useUserProfile() era un hook plano con su propia suscripción
// onSnapshot(doc(db, 'users', uid)), llamado de forma independiente en 9
// puntos de la app — hasta 4 listeners simultáneos al mismo documento en
// una sola pantalla (ProtectedRoute + EventWall + WallSection, y un 5º si
// se abría ReportModal desde ahí; ver el comentario histórico en
// ReportButton.tsx). Un solo UserProfileProvider dentro de AuthProvider
// colapsa eso a 1 listener por sesión — mismo patrón que ya se usó para
// AuthContext (ver el comentario ahí).
export function UserProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuthContext()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
    // Sin sesión no hay nada que suscribir — el `value` memoizado de abajo
    // ya devuelve { profile: null, loadingProfile: false } en ese caso, así
    // que no hace falta pisar el estado local acá (evita un setState
    // síncrono dentro del efecto).
    if (!user) return
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? ({ uid: user.uid, ...snap.data() } as UserProfile) : null)
      setLoadingProfile(false)
    }, withListenerReporting('userProfile', () => setLoadingProfile(false)))
    return unsub
    // Depende del uid (primitivo), no del objeto `user` completo: Firebase Auth
    // emite una nueva instancia de user en cada cambio de estado de auth aunque
    // el uid no cambie, y resuscribirse en esos casos sería innecesario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  const value = useMemo(
    () => (user ? { profile, loadingProfile } : { profile: null, loadingProfile: false }),
    [user, profile, loadingProfile],
  )

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUserProfileContext(): UserProfileContextValue {
  const ctx = useContext(UserProfileContext)
  if (!ctx) throw new Error('useUserProfileContext (useUserProfile) debe usarse dentro de <UserProfileProvider>')
  return ctx
}
