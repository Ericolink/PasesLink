// Migra el mapa `reactions` embebido de cada mensaje del muro (`wall`) y
// foto (`photos`) a la subcolección .../reactions/{token} (un doc por
// reactor), y recalcula reactionCount/reactionCountsByType en el documento
// padre — mismos campos que reactToContent (src/firebase/interactions.ts)
// ya mantiene con increment() para reacciones NUEVAS desde que se desplegó
// ese cambio. Este backfill cubre las reacciones que ya existían ANTES de
// eso, que solo viven en el mapa viejo.
//
// Auditoría F2/F11: `reactions{}` puede superar el límite de 1MB/documento
// con contenido viral — la subcolección no tiene ese techo. Correr este
// script ANTES (o junto con) desplegar el paso que hace que la UI
// (ReactionListSheet) lea la subcolección en vez del mapa: si se despliega
// esa UI sin este backfill, cualquier mensaje/foto con reacciones viejas va
// a mostrar la lista de "quién reaccionó" vacía o incompleta hasta que este
// script corra (el conteo total SÍ es correcto desde antes, ver
// reactionCount).
//
// Uso:
//   node scripts/backfill-reactions-subcollection.mjs
//
// Credenciales: mismo patrón que el resto de scripts/backfill-*.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service
// account) o FIRESTORE_EMULATOR_HOST para probar contra el emulador.
//
// NO está programado en GitHub Actions — es un one-off manual. Idempotente:
// puede correrse más de una vez sin problema (siempre recalcula desde el
// mapa `reactions`, que sigue siendo la fuente de verdad hasta que se quite
// — ver TODO en types/index.ts).
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'app-pases-9e6e7'
const REACTION_TYPES = ['like', 'love', 'haha', 'wow', 'sad', 'angry']
const BATCH_CHUNK = 450

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

async function backfillCollection(db, eventDoc, collectionName) {
  const docsSnap = await eventDoc.ref.collection(collectionName).get()
  let updated = 0

  for (const contentDoc of docsSnap.docs) {
    const reactions = contentDoc.data().reactions || {}
    const entries = Object.entries(reactions).filter(([, r]) => REACTION_TYPES.includes(r?.type))
    if (entries.length === 0) continue

    const reactionCountsByType = Object.fromEntries(REACTION_TYPES.map((t) => [t, 0]))
    let batch = db.batch()
    let batchSize = 0
    for (const [token, reaction] of entries) {
      reactionCountsByType[reaction.type]++
      batch.set(contentDoc.ref.collection('reactions').doc(token), {
        type: reaction.type,
        name: reaction.name || 'Invitado',
        ...(reaction.photoURL ? { photoURL: reaction.photoURL } : {}),
        // reactedAt: reacciones de antes de que este campo existiera no lo
        // tienen — sin fallback, orderBy('reactedAt') en ReactionListSheet
        // las excluiría en silencio (Firestore descarta docs sin el campo
        // ordenado). Date.now() las manda al final del orden "más recientes
        // primero", que es el comportamiento correcto para datos sin fecha.
        reactedAt: reaction.reactedAt || Date.now(),
      })
      batchSize++
      if (batchSize >= BATCH_CHUNK) {
        await batch.commit()
        batch = db.batch()
        batchSize = 0
      }
    }
    if (batchSize > 0) await batch.commit()

    const reactionCount = entries.length
    await contentDoc.ref.update({ reactionCount, reactionCountsByType })
    updated++
    console.log(`${eventDoc.id}/${collectionName}/${contentDoc.id}: reactionCount=${reactionCount}`)
  }

  return updated
}

async function main() {
  const db = initFirestore()
  const eventsSnap = await db.collection('events').get()
  let totalUpdated = 0
  for (const eventDoc of eventsSnap.docs) {
    totalUpdated += await backfillCollection(db, eventDoc, 'wall')
    totalUpdated += await backfillCollection(db, eventDoc, 'photos')
  }
  console.log(`Documentos migrados: ${totalUpdated}`)
}

main().catch((err) => {
  console.error('Backfill de reactions subcollection falló:', err)
  process.exitCode = 1
})
