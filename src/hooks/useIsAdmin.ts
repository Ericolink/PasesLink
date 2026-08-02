import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from './useAuth'

// Listener (no lectura única) sobre admins/{uid} — necesario desde la
// migración a custom claims (FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md Fase C):
// el estado "real" para las Rules es `request.auth.token.admin`, pero el
// token del cliente solo se refresca solo cada ~1h. Cuando este listener ve
// que el doc y el claim cacheado quedaron desincronizados (alguien acaba de
// ser agregado/quitado como admin desde la consola de Firebase, y
// functions/src/triggers/onAdminWritten.ts ya corrió), fuerza un refresh del
// ID token para que el claim quede al día sin esperar esa hora ni pedirle al
// usuario que cierre sesión. `isAdmin` en sí sigue reflejando el doc (misma
// fuente que Rules usa como red de compatibilidad), no el claim — evita
// depender de que el refresh ya haya terminado para pintar la UI.
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
    const unsubscribe = onSnapshot(
      doc(db, 'admins', user.uid),
      async (snap) => {
        const existsInFirestore = snap.exists()
        setIsAdmin(existsInFirestore)
        setLoading(false)
        try {
          const tokenResult = await user.getIdTokenResult()
          if ((tokenResult.claims.admin === true) !== existsInFirestore) {
            await user.getIdToken(true)
          }
        } catch (err) {
          console.error('Error sincronizando el claim admin del token:', err)
        }
      },
      (err) => {
        console.error('Error verificando acceso de admin:', err)
        setIsAdmin(false)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [user])
  /* eslint-enable react-hooks/set-state-in-effect */

  return { isAdmin, loading }
}
