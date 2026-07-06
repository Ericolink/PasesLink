import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from './useAuth'
import { withListenerReporting } from '../lib/sentry'
import type { UserProfile } from '../types'

export function useUserProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  useEffect(() => {
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

  if (!user) return { profile: null, loadingProfile: false }
  return { profile, loadingProfile }
}
