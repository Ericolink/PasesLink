// Antes este hook tenía su propia suscripción onSnapshot(doc(db,
// 'users', uid)), llamada de forma independiente en cada uno de sus 9
// puntos de uso (ver el comentario en UserProfileContext.tsx). Ahora es un
// re-export delgado del contexto compartido, para que ningún punto de
// llamada existente (`import { useUserProfile } from
// '../hooks/useUserProfile'`) tenga que cambiar.
export { useUserProfileContext as useUserProfile } from '../contexts/UserProfileContext'
