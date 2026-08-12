# Query Explain (manual)

Herramienta de desarrollo para analizar el plan/costo de una consulta de
Firestore usando `Query.explain()`, nativo de `@google-cloud/firestore`
(dependencia transitiva de `firebase-admin`, ya presente en el proyecto —
sin dependencias nuevas). Manual y bajo demanda: no corre en CI, no bloquea
merges, no modifica producción.

## 1. Qué hace

Ejecuta una de un puñado de consultas reales del proyecto (copiadas de
`src/firebase/*.ts`) contra Firestore y muestra el plan que usaría
(`indexesUsed`) y, si se pide, las estadísticas reales de ejecución
(documentos devueltos, operaciones de lectura, duración, y el detalle que
Firestore entregue en `debugStats` — sin inventar métricas propias).

## 2. Cómo ejecutarlo

```bash
npm run firestore:explain -- --list                          # ver consultas disponibles
npm run firestore:explain -- events                           # plan only, sin costo
npm run firestore:explain -- guests --event <eventId>          # plan only
npm run firestore:explain -- guests --event <eventId> --analyze  # ejecuta de verdad (lecturas reales)
npm run firestore:explain -- reports --status pending --analyze
```

Sin `--analyze`, solo pide el plan (gratis, no lee documentos). Con
`--analyze`, ejecuta la consulta de verdad — mismo costo que un `.get()`
normal. `--limit <n>` acota el análisis puntual sin tocar el código fuente.

## 3. Permisos

Corre siempre contra el proyecto real `app-pases-9e6e7` (PaseLink no tiene
un Firestore de staging separado). Requiere
`FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7` (mismo secret que ya usan
`backup-firestore.mjs`/los scripts de backfill) con el rol IAM **Cloud
Datastore User** o superior — no hace falta ningún permiso nuevo. Se niega a
correr contra `FIRESTORE_EMULATOR_HOST`: el emulador no calcula
estadísticas reales de índice/costo.

## 4. Qué observar

- `planSummary.indexesUsed`: confirma que la consulta usa el índice
  esperado (no un escaneo de colección).
- `executionStats.resultsReturned` vs. `readOperations`: si `readOperations`
  es mucho mayor que `resultsReturned`, la consulta está leyendo/filtrando
  de más de lo que devuelve.
- `executionStats.debugStats`: contenido tal cual lo entrega Firestore
  (típicamente incluye documentos e índices examinados) — sujeto a cambios
  del lado de Google, por eso no se reformatea ni se reinterpreta acá.

## 5. Ejemplo de interpretación

`resultsReturned: 40` con `readOperations: 40` → la consulta lee
exactamente lo que devuelve, bien resuelta por índice. Si en cambio
`readOperations` fuera mucho mayor que `resultsReturned` en una consulta con
`where`, es señal de que falta una condición en el índice compuesto y
Firestore está filtrando después de leer de más — recién ahí valdría la
pena revisar `firestore.indexes.json`, no antes.
