// Antes este hook tenía su propia suscripción onAuthStateChanged, llamada de
// forma independiente en cada uno de sus ~27 puntos de uso (hasta 8
// listeners simultáneos en una sola pantalla — ver el comentario en
// AuthContext.tsx). Ahora es un re-export delgado del contexto compartido,
// para que ningún punto de llamada existente (`import { useAuth } from
// '../hooks/useAuth'`) tenga que cambiar.
export { useAuthContext as useAuth } from '../contexts/AuthContext'
