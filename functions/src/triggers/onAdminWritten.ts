// Sincroniza el custom claim `admin` con el documento admins/{uid} — ver
// FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md Fase C / BLAZE_ENTERPRISE_
// ARCHITECTURE_AUDIT.md §3.2. El alta/baja de admins sigue siendo 100%
// manual desde la consola de Firebase (allow write: if false en
// firestore.rules) — este trigger es lo único que reacciona a ese cambio,
// para que `request.auth.token.admin` quede disponible sin que las reglas
// tengan que volver a leer Firestore en cada `isAdmin()`.
//
// Sin test directo — mismo criterio que el otro trigger del proyecto
// (onCapacityFreed): dispararlo de verdad requiere el emulador de Functions
// desplegado, que `test:functions` no levanta. Es demasiado delgado (una
// sola llamada al Admin SDK) para que valga la pena extraer una función pura
// aparte solo para poder testearla.
//
// setCustomUserClaims(uid, null) borra el objeto de claims entero — seguro
// acá porque `admin` es el único custom claim que usa este proyecto (ver
// grep de `customClaims`/`setCustomUserClaims` antes de esta migración: no
// había ninguno). Si en el futuro se agrega otro claim, esto tiene que
// pasar a mergear en vez de reemplazar.
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getAuth } from 'firebase-admin/auth'
import { withTriggerObservability } from '../lib/observability/withObservability.js'

// Sin memory/timeoutSeconds propios (hereda 256MiB/60s del default global)
// aunque el trabajo real es una sola llamada al Admin SDK — ver el mismo
// comentario en getOfferedWaitlistCount.ts. maxInstances bajo: disparado
// solo por altas/bajas manuales de admins/{uid} desde la consola, evento
// rarísimo.
export const onAdminWritten = onDocumentWritten(
  { document: 'admins/{uid}', maxInstances: 5 },
  (event) => withTriggerObservability(event, 'onAdminWritten', async () => {
    const isAdminNow = event.data?.after.exists ?? false
    await getAuth().setCustomUserClaims(event.params.uid, isAdminNow ? { admin: true } : null)
  }),
)
