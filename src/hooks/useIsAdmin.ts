import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { checkIsAdmin } from '../firebase/admin'

// Lectura única (no listener) — el estado de admin no cambia mientras la
// sesión está abierta en la práctica (se gestiona a mano desde la consola
// de Firebase), así que no justifica un onSnapshot permanente.
export function useIsAdmin() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!user) {
      setIsAdmin(false)
      setLoading(false)
      return
    }
    setLoading(true)
    checkIsAdmin(user.uid)
      .then(setIsAdmin)
      .catch((err) => {
        console.error('Error verificando acceso de admin:', err)
        setIsAdmin(false)
      })
      .finally(() => setLoading(false))
  }, [user])
  /* eslint-enable react-hooks/set-state-in-effect */

  return { isAdmin, loading }
}
