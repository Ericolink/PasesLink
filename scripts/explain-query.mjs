// Query Explain manual sobre Firestore — imprime el plan (y, si se pide, las
// estadísticas reales de ejecución) de una consulta representativa de las
// colecciones que más pueden crecer en PaseLink. Usa Query.explain(), nativo
// de @google-cloud/firestore (ya viene con firebase-admin: cero dependencias
// nuevas). Ver docs/query-explain.md para el resumen de uso.
//
// Uso:
//   node scripts/explain-query.mjs --list
//   node scripts/explain-query.mjs <consulta> [opciones]
//
// Ejemplos:
//   node scripts/explain-query.mjs events
//   node scripts/explain-query.mjs guests --event <eventId>
//   node scripts/explain-query.mjs guests --event <eventId> --analyze
//   node scripts/explain-query.mjs reports --status pending --analyze
//
// Por defecto NO ejecuta la consulta (analyze:false): solo le pide el plan a
// Firestore (qué índice usaría) sin leer un solo documento, sin costo. Pasar
// --analyze SÍ la ejecuta de verdad (las mismas lecturas facturables que un
// .get() normal) para ver documentsScanned/indexEntriesScanned reales — usalo
// cuando el plan solo no alcance para decidir si una consulta es cara.
//
// Herramienta 100% manual y de solo lectura — no hay gate de CI, no corre
// sola, no modifica índices/reglas/consultas del código. Cada consulta acá es
// una copia de una consulta real ya existente (ver el comentario de cada una
// para el archivo/línea de origen); si esa consulta cambia en el código,
// actualizar acá a mano — el cliente usa firebase/firestore (Web SDK) y este
// script usa firebase-admin (Node Admin SDK), son builders distintos y no se
// pueden compartir.
//
// Credenciales: mismo patrón que el resto de scripts/ —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service
// account ya usada por backups/backfills; necesita el rol IAM "Cloud
// Datastore User" o superior, el mismo que ya tiene esa cuenta).
//
// Corre SIEMPRE contra el proyecto real (app-pases-9e6e7): PaseLink no tiene
// un proyecto de staging separado (ver docs/query-explain.md), así que no
// hay "proyecto equivocado" posible entre el que elegir — por eso no se pide
// una variable tipo GOOGLE_CLOUD_PROJECT, solo se imprime el proyecto usado
// en cada corrida para que quede a la vista. Rechaza correr contra
// FIRESTORE_EMULATOR_HOST a propósito: el emulador no calcula estadísticas
// reales de índice/costo, así que un --analyze contra él daría números sin
// valor diagnóstico disfrazados de reales.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'app-pases-9e6e7'

function initDb() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST está seteado — este script se niega a correr contra el emulador ' +
        'porque no calcula estadísticas reales de índice/costo (ver comentario de cabecera). ' +
        'Desseteá esa variable para apuntar al proyecto real.',
    )
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7
  if (!raw) {
    throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service account).')
  }
  initializeApp({ credential: cert(JSON.parse(raw)), projectId: PROJECT_ID })
  return getFirestore()
}

// `bounded: true` = la consulta original ya trae su propio limit() en el
// código fuente (ver docs), así que --analyze sobre ella es tan barato como
// la consulta real. `bounded: false` = la consulta original NO tiene límite
// (deliberado, ver auditoría de Firestore) — --analyze la ejecuta completa,
// con el mismo costo que tendría en producción. `--limit` permite acotar
// cualquiera de estas para un análisis puntual sin fingir que así es como
// corre hoy en la app.
const QUERIES = {
  events: {
    description: 'Todos los eventos, más recientes primero — src/firebase/admin.ts (getAllEvents, panel admin).',
    needsEvent: false,
    bounded: false,
    build: (db) => db.collection('events').orderBy('createdAt', 'desc'),
  },
  guests: {
    description: 'Todos los invitados de un evento — src/firebase/guests.ts (getAllGuests, usado por Reports.tsx).',
    needsEvent: true,
    bounded: false,
    build: (db, { eventId }) => db.collection('events').doc(eventId).collection('guests').orderBy('createdAt', 'asc'),
  },
  checkins: {
    description: 'Check-ins de un evento — src/firebase/reports.ts (getCheckins).',
    needsEvent: true,
    bounded: false,
    build: (db, { eventId }) => db.collection('events').doc(eventId).collection('checkins').orderBy('timestamp', 'asc'),
  },
  reports: {
    description:
      'Reportes de contenido recientes, opcionalmente filtrados por estado — src/firebase/moderation.ts (subscribeToRecentReports).',
    needsEvent: false,
    bounded: true,
    build: (db, { status, limitN }) => {
      let q = db.collection('reports')
      if (status) q = q.where('status', '==', status)
      return q.orderBy('createdAt', 'desc').limit(limitN ?? 50) // 50 = DEFAULT_REPORTS_LIVE_LIMIT en moderation.ts
    },
  },
  waitlist: {
    description: 'Lista de espera activa (waiting/offered) de un evento — src/firebase/waitlist.ts (subscribeToWaitlist).',
    needsEvent: true,
    bounded: false,
    build: (db, { eventId }) =>
      db
        .collection('events')
        .doc(eventId)
        .collection('waitlist')
        .where('status', 'in', ['waiting', 'offered'])
        .orderBy('priorityBoost', 'desc')
        .orderBy('createdAt', 'asc'),
  },
  concessions: {
    description:
      'Órdenes de concesiones pendientes de pago de un evento — src/firebase/concessions.ts (subscribeToConcessionOrdersPendingPayment).',
    needsEvent: true,
    bounded: false,
    build: (db, { eventId }) =>
      db
        .collection('events')
        .doc(eventId)
        .collection('concessionsOrders')
        .where('paymentPhase', 'in', ['awaiting_payment', 'proof_submitted'])
        .orderBy('createdAt', 'asc'),
  },
}

function parseArgs(argv) {
  const [name, ...rest] = argv
  const opts = { analyze: false }
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--analyze') opts.analyze = true
    else if (arg === '--event') opts.eventId = rest[++i]
    else if (arg === '--status') opts.status = rest[++i]
    else if (arg === '--limit') opts.limitN = Number(rest[++i])
    else throw new Error(`Opción desconocida: ${arg} (usá --list para ver el uso).`)
  }
  return { name, opts }
}

function printList() {
  console.log('Consultas disponibles:\n')
  for (const [name, def] of Object.entries(QUERIES)) {
    console.log(`  ${name}${def.needsEvent ? ' --event <eventId>' : ''}${def.bounded ? '' : '  [sin límite en el código original]'}`)
    console.log(`    ${def.description}\n`)
  }
  console.log('Opciones:')
  console.log('  --analyze       ejecuta la consulta de verdad (lecturas reales facturables); sin esto, solo plan')
  console.log('  --status <v>    solo "reports" — filtra por estado')
  console.log('  --limit <n>     acota el resultado para este análisis puntual (no cambia el código)')
}

function formatDuration(d) {
  if (!d) return 'n/d'
  return `${(d.seconds + d.nanoseconds / 1e9).toFixed(3)}s`
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '--list' || argv[0] === '-h' || argv[0] === '--help') {
    printList()
    return
  }

  const { name, opts } = parseArgs(argv)
  const def = QUERIES[name]
  if (!def) {
    console.error(`Consulta desconocida: "${name}". Usá --list para ver las disponibles.`)
    process.exitCode = 1
    return
  }
  if (def.needsEvent && !opts.eventId) {
    console.error(`"${name}" necesita --event <eventId>.`)
    process.exitCode = 1
    return
  }

  const db = initDb()
  let query = def.build(db, opts)
  let limitNote = ''
  if (name !== 'reports' && opts.limitN) {
    query = query.limit(opts.limitN)
    limitNote = ` (con limit(${opts.limitN}) agregado solo para este análisis)`
  }

  console.log(`Proyecto: ${PROJECT_ID}`)
  console.log(`Consulta: ${name}${limitNote} — ${def.description}`)
  console.log(`Modo: ${opts.analyze ? 'ANALYZE (ejecuta de verdad, lecturas reales facturables)' : 'plan-only (sin leer documentos, sin costo)'}`)
  if (opts.analyze && !def.bounded && !opts.limitN) {
    console.log('AVISO: esta consulta no tiene límite en el código original — analyze va a leer y facturar TODOS los documentos que devuelva. Agregá --limit <n> para acotar el análisis si el evento/colección es grande.')
  }
  console.log()

  const { metrics } = await query.explain({ analyze: opts.analyze })

  console.log('--- Plan ---')
  console.log('Índices usados:', JSON.stringify(metrics.planSummary.indexesUsed, null, 2))

  if (metrics.executionStats) {
    const s = metrics.executionStats
    console.log('\n--- Ejecución (analyze=true) ---')
    console.log(`Documentos devueltos: ${s.resultsReturned}`)
    console.log(`Operaciones de lectura: ${s.readOperations}`)
    console.log(`Duración: ${formatDuration(s.executionDuration)}`)
    console.log('Detalle adicional (tal cual lo entrega Firestore):', JSON.stringify(s.debugStats, null, 2))
  } else {
    console.log('\n(Sin estadísticas de ejecución — corré con --analyze para verlas.)')
  }
}

main().catch((err) => {
  console.error('Query Explain falló:', err.message || err)
  process.exitCode = 1
})
