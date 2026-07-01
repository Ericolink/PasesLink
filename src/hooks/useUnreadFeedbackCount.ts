import { useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { useIsAdmin } from './useIsAdmin'
import { subscribeToUnreadFeedbackCount } from '../firebase/feedback'

// Compartido entre Navbar (badge junto a "Admin") y AdminDashboard (pestaña
// "Buzón"), para no duplicar la misma suscripción en ambos lugares.
export function useUnreadFeedbackCount() {
  const { user } = useAuth()
  const { isAdmin } = useIsAdmin()
  const [count, setCount] = useState(0)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!user || !isAdmin) {
      setCount(0)
      return
    }
    return subscribeToUnreadFeedbackCount(setCount, (err) => {
      console.error('Error al contar feedback sin leer:', err)
    })
  }, [user, isAdmin])
  /* eslint-enable react-hooks/set-state-in-effect */

  return count
}
