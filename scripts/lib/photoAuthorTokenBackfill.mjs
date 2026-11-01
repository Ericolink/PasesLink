// Lógica del backfill de photos.authorToken (T4 de P0-4, hallazgo N2) —
// separada del CLI (scripts/backfill-photo-author-tokens.mjs) para poder
// probarla contra el emulador (src/firebase/__tests__/photoAuthorTokenBackfill.test.ts).
//
// Desde v1.28.0, WallSection guardaba el qrToken del invitado en
// photos.authorToken (colección de lectura pública). Las fotos nuevas ya
// guardan SHA-256(qrToken) (src/utils/photoAuthor.ts); este módulo migra
// las viejas.
//
// Clasificación de cada foto según su authorToken:
// - alreadyHashed: 64 caracteres hex — ya migrada, no se toca.
// - empty: ausente o vacío — no se toca.
// - migrate: coincide EXACTAMENTE con el qrToken de un invitado real del
//   mismo evento — se reemplaza por su hash. Única clase que se escribe.
// - pending: tiene forma de qrToken (32 hex, el único formato que generó
//   generateQrToken desde v1.0) pero no coincide con ningún invitado del
//   evento (invitado borrado, datos raros) — NO se inventa un hash, se
//   reporta para revisión manual.
// - notApplicable: cualquier otro valor (uid de la sesión, 'owner', nombre
//   del invitado) — identificadores que ya eran públicos, no se tocan.
//
// Nunca imprime tokens ni hashes: solo cantidades y rutas de documentos
// (los ids de fotos/eventos ya son públicos).
import { createHash } from 'node:crypto'
import { FieldPath } from 'firebase-admin/firestore'

const HASH_PATTERN = /^[0-9a-f]{64}$/
const QR_TOKEN_PATTERN = /^[0-9a-f]{32}$/
// gRPC FAILED_PRECONDITION: la foto cambió entre la lectura y la escritura
// (p. ej. alguien reaccionó) — se cuenta como fallida y la próxima corrida
// la vuelve a intentar desde cero.
const FAILED_PRECONDITION = 9

/** Mismo resultado que hashGuestQrToken (src/utils/photoAuthor.ts, Web Crypto). */
export function hashQrToken(qrToken) {
  return createHash('sha256').update(qrToken, 'utf8').digest('hex')
}

export function classifyAuthorToken(authorToken, guestQrTokens) {
  if (typeof authorToken !== 'string' || authorToken.length === 0) return 'empty'
  if (HASH_PATTERN.test(authorToken)) return 'alreadyHashed'
  if (guestQrTokens.has(authorToken)) return 'migrate'
  if (QR_TOKEN_PATTERN.test(authorToken)) return 'pending'
  return 'notApplicable'
}

async function* paginate(query, pageSize) {
  let last = null
  for (;;) {
    const page = await (last ? query.startAfter(last) : query).limit(pageSize).get()
    if (page.empty) return
    yield page.docs
    if (page.size < pageSize) return
    last = page.docs[page.docs.length - 1]
  }
}

async function loadGuestQrTokens(eventRef, pageSize) {
  const tokens = new Set()
  const query = eventRef.collection('guests').select('qrToken').orderBy(FieldPath.documentId())
  for await (const docs of paginate(query, pageSize)) {
    for (const d of docs) {
      const token = d.get('qrToken')
      if (typeof token === 'string' && token) tokens.add(token)
    }
  }
  return tokens
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{ dryRun: boolean, pageSize?: number, log?: (msg: string) => void }} options
 */
export async function backfillPhotoAuthorTokens(db, { dryRun, pageSize = 300, log = () => {} }) {
  if (typeof dryRun !== 'boolean') throw new Error('backfillPhotoAuthorTokens: falta indicar dryRun explícitamente.')

  const stats = {
    eventsScanned: 0,
    photosScanned: 0,
    migrated: 0,
    alreadyHashed: 0,
    empty: 0,
    notApplicable: 0,
    pending: [],
    failed: [],
  }

  const writer = dryRun ? null : db.bulkWriter()
  if (writer) {
    writer.onWriteError((err) => err.code !== FAILED_PRECONDITION && err.failedAttempts < 3)
  }
  const writes = []

  const eventsQuery = db.collection('events').orderBy(FieldPath.documentId())
  for await (const eventDocs of paginate(eventsQuery, pageSize)) {
    for (const eventDoc of eventDocs) {
      stats.eventsScanned++
      const photosQuery = eventDoc.ref.collection('photos').orderBy(FieldPath.documentId())
      let guestQrTokens = null

      for await (const photoDocs of paginate(photosQuery, pageSize)) {
        for (const photo of photoDocs) {
          stats.photosScanned++
          const authorToken = photo.get('authorToken')
          // Los invitados del evento se cargan una sola vez y solo si hace
          // falta (eventos sin fotos o con todas ya migradas no los leen).
          if (guestQrTokens === null && typeof authorToken === 'string' && authorToken && !HASH_PATTERN.test(authorToken)) {
            guestQrTokens = await loadGuestQrTokens(eventDoc.ref, pageSize)
          }
          const kind = classifyAuthorToken(authorToken, guestQrTokens ?? new Set())

          if (kind === 'migrate') {
            if (dryRun) {
              stats.migrated++
              continue
            }
            // Precondición lastUpdateTime: si la foto cambió desde que se
            // leyó, la escritura falla en vez de pisar nada; update() solo
            // toca authorToken, el resto de los campos queda intacto.
            writes.push(
              writer.update(photo.ref, { authorToken: hashQrToken(authorToken) }, { lastUpdateTime: photo.updateTime })
                .then(() => { stats.migrated++ })
                .catch((err) => {
                  stats.failed.push(photo.ref.path)
                  log(`  ! falló ${photo.ref.path} (código ${err.code ?? 'desconocido'})`)
                }),
            )
          } else if (kind === 'pending') {
            stats.pending.push(photo.ref.path)
          } else {
            stats[kind]++
          }
        }
      }
    }
  }

  if (writer) {
    await writer.close()
    await Promise.all(writes)
  }

  log(`${dryRun ? '[dry-run] ' : ''}Eventos revisados: ${stats.eventsScanned}`)
  log(`${dryRun ? '[dry-run] ' : ''}Fotos revisadas: ${stats.photosScanned}`)
  log(`${dryRun ? '[dry-run] Se migrarían' : 'Migradas'}: ${stats.migrated}`)
  log(`Omitidas — ya migradas: ${stats.alreadyHashed}, sin authorToken: ${stats.empty}, no son qrToken (uid/nombre): ${stats.notApplicable}`)
  log(`Pendientes de revisión (forma de qrToken sin invitado): ${stats.pending.length}`)
  for (const path of stats.pending) log(`  ? ${path}`)
  log(`Fallidas: ${stats.failed.length}`)

  return stats
}
