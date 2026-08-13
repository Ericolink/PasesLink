// Migra coorganizadores (coOrganizersMap) y encargados de "Ventas del
// evento" (concessions.concessionsStaffMap) existentes al modelo unificado
// event.collaborators — ver ROLES_PERMISSIONS_REDESIGN.md §3 (Migración de
// datos existentes) y Fase 6. Los mapas legacy NO se tocan ni se borran acá
// (siguen siendo la fuente real hasta que las Fases 2-5 confirmen en
// producción que todo colaborador activo tiene su entrada equivalente en
// collaborators) — este script solo AGREGA entradas nuevas al mapa nuevo,
// nunca escribe sobre las viejas.
//
// Criterio de mapeo (mismo que documenta §3, sin inferir roles más angostos
// de los que los booleanos legacy no permiten distinguir con certeza):
//   - Cualquier uid de coOrganizersMap -> role: 'administrador'.
//   - concessionsStaffMap[uid].roles.cashier === true -> role: 'caja'
//     (si además roles.prep === true, se agrega permissionOverrides.prepareOrders
//     para no perder ese acceso — la persona sigue siendo UN colaborador, un
//     solo `role`, no dos entradas separadas).
//   - Solo roles.prep === true (o shape legado: string = solo el email) ->
//     role: 'preparacion'.
//   - Si el mismo uid ya está en coOrganizersMap, ese mapeo gana (administrador
//     es un superconjunto de caja/preparación) — el encargado de ventas
//     también coorganizador no pierde nada.
//
// Uso:
//   node scripts/backfill-collaborators-from-legacy.mjs
//
// Credenciales: mismo patrón que scripts/backup-firestore.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service
// account) o FIRESTORE_EMULATOR_HOST para probar contra el emulador.
//
// NO está programado en GitHub Actions — es un one-off manual. Idempotente:
// nunca pisa una entrada que ya exista en `collaborators` (ni la creada por
// este mismo script en una corrida anterior, ni una aceptada de verdad vía
// el flujo nuevo de invitación) — correrlo dos veces no hace nada la segunda
// vez sobre los uids ya migrados.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'app-pases-9e6e7'

function initFirestore() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: PROJECT_ID })
    return getFirestore()
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7
  if (!raw) {
    throw new Error(
      'Falta FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (o FIRESTORE_EMULATOR_HOST para probar contra el emulador).',
    )
  }
  const parsed = JSON.parse(raw)
  initializeApp({ credential: cert(parsed) })
  return getFirestore()
}

// Mismo criterio que resolveConcessionsStaffEntry (src/types/concessions.ts)
// — un shape legado (string = solo el email) se interpreta como
// solo-preparación, el único acceso que esos encargados ya tenían.
function resolveLegacyStaffEntry(raw) {
  if (raw == null) return null
  if (typeof raw === 'string') return { email: raw, roles: { cashier: false, prep: true } }
  return raw
}

async function main() {
  const db = initFirestore()
  const eventsSnap = await db.collection('events').get()
  let eventsUpdated = 0
  let collaboratorsCreated = 0

  for (const eventDoc of eventsSnap.docs) {
    const data = eventDoc.data()
    const ownerId = data.ownerId
    const existingCollaborators = data.collaborators || {}
    const coOrganizersMap = data.coOrganizersMap || {}
    const staffMap = data.concessions?.concessionsStaffMap || {}

    const patch = {}
    let count = 0

    for (const [uid, email] of Object.entries(coOrganizersMap)) {
      if (uid === ownerId || existingCollaborators[uid]) continue
      patch[`collaborators.${uid}`] = {
        email,
        role: 'administrador',
        invitedBy: ownerId,
        invitedAt: Date.now(),
      }
      count++
    }

    for (const [uid, raw] of Object.entries(staffMap)) {
      if (uid === ownerId || existingCollaborators[uid] || `collaborators.${uid}` in patch) continue
      const entry = resolveLegacyStaffEntry(raw)
      if (!entry) continue
      if (entry.roles.cashier) {
        patch[`collaborators.${uid}`] = {
          email: entry.email,
          role: 'caja',
          ...(entry.roles.prep ? { permissionOverrides: { prepareOrders: true } } : {}),
          invitedBy: ownerId,
          invitedAt: Date.now(),
        }
      } else {
        patch[`collaborators.${uid}`] = {
          email: entry.email,
          role: 'preparacion',
          invitedBy: ownerId,
          invitedAt: Date.now(),
        }
      }
      count++
    }

    if (count === 0) continue
    await eventDoc.ref.update(patch)
    eventsUpdated++
    collaboratorsCreated += count
    console.log(`${eventDoc.id}: ${count} colaborador(es) migrado(s) a event.collaborators`)
  }

  console.log(`Eventos actualizados: ${eventsUpdated}/${eventsSnap.size} (colaboradores creados: ${collaboratorsCreated})`)
}

main().catch((err) => {
  console.error('Backfill de event.collaborators falló:', err)
  process.exitCode = 1
})
