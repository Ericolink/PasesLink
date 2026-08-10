// Autoeliminación de cuenta (Perfil → Cuenta → "Eliminar mi cuenta"). El
// usuario SOLO puede borrar su propia cuenta: el uid nunca viaja en
// request.data, sale exclusivamente de request.auth.uid (verificado por el
// token). No existe forma de que un cliente pida borrar el uid de otro.
//
// Orden de operaciones — Firestore primero (deleteAccountData), Auth al
// final: si algo falla a mitad de camino, es preferible quedar con una
// cuenta de Auth viva y datos parcialmente limpios (se puede reintentar,
// la limpieza es idempotente) que con el uid ya inutilizado en Auth y datos
// huérfanos en Firestore imposibles de re-vincular.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { deleteAccountData } from '../account/deleteAccountData.js'

// admin.auth().deleteUser() —a diferencia de user.delete() en el cliente—
// NO exige sesión reciente. Este chequeo sobre `auth_time` (el instante en
// que el usuario efectivamente presentó credenciales, no cuándo se refrescó
// el token) es la única barrera real contra borrar la cuenta desde una
// pestaña vieja sin volver a autenticarse. El cliente reautentica antes de
// llamar a esta función — ver reauthenticateWithPassword/
// reauthenticateWithGoogle en src/firebase/auth.ts.
const MAX_AUTH_AGE_SECONDS = 5 * 60

export const deleteAccount = onCall(
  { timeoutSeconds: 120 },
  (request) => withCallableObservability(request, 'deleteAccount', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const uid = request.auth.uid
    ctx.addContext({ uid })

    const authTime = Number(request.auth.token.auth_time ?? 0)
    const ageSeconds = Date.now() / 1000 - authTime
    if (!authTime || ageSeconds > MAX_AUTH_AGE_SECONDS) {
      throw new HttpsError(
        'failed-precondition',
        'Para eliminar tu cuenta necesitamos verificar nuevamente tu identidad.',
        { reason: 'requires-recent-login' },
      )
    }

    const db = getFirestore()
    const result = await deleteAccountData(db, uid)
    ctx.logger.info('Datos de Firestore eliminados/desvinculados', result)

    // Firebase Authentication, al final. A partir de acá el uid deja de
    // poder autenticarse y el email queda libre para una cuenta nueva.
    await getAuth().deleteUser(uid)

    return { ok: true as const }
  }),
)
