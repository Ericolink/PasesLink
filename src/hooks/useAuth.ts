import { useEffect, useState } from 'react'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '../firebase/config'

export function useAuth() {
  // Inicializar desde auth.currentUser (no null) evita un "flash" de sesión
  // cerrada cada vez que este hook se remonta dentro de la misma sesión del
  // navegador — por ejemplo en GuestPass, que se remonta a propósito (key)
  // en cada invitado escaneado. onAuthStateChanged siempre dispara su primer
  // callback de forma asíncrona, incluso si Firebase ya conoce al usuario, así
  // que sin esto cada remonte pasaba por un instante con user=null donde la
  // app trataba al organizador como invitado público.
  const [user, setUser] = useState<User | null>(() => auth.currentUser)
  const [loading, setLoading] = useState(() => !auth.currentUser)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return { user, loading }
}
