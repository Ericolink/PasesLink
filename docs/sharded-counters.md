# Contadores shardeados condicionales

Este documento describe la arquitectura de contadores de `events/{eventId}`
que soporta activar sharding contador por contador, cuándo hacerlo y cuándo
no, y el checklist para migrar uno en producción. Complementa (no
reemplaza) `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §8.1`,
`CAPACITY_LIMIT_ARCHITECTURE.md` y `FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md`,
que ya habían identificado este riesgo.

## 1. Problema que resuelve

Los contadores agregados de un evento (`checkedInCount`, `occupancyCount`,
`peopleCount`, etc.) viven todos en el mismo documento `events/{eventId}`.
Firestore tiene un límite práctico de **~1 escritura sostenida por segundo
por documento**. Con miles de check-ins simultáneos en la puerta de un
evento grande, ese único documento se convierte en el cuello de botella de
todo el sistema — las transacciones empiezan a reintentar por conflicto de
versión, la latencia sube, y en el peor caso el check-in se degrada en la
puerta.

## 2. Auditoría — contadores y clasificación de riesgo

| Contador | Documento | Quién escribe | Riesgo | Motivo |
|---|---|---|---|---|
| `occupancyCount` | `events/{id}` | cliente (`walkIn`/`walkOut`) + servidor (`checkIn`/`checkOut`/`confirmPaymentAndCheckIn`) | **Alto** | Es un GATE de capacidad (se lee dentro de la misma transacción que decide `full`/`success`); todo check-in/walk-in de un evento pasa por el mismo documento |
| `peopleCount` | `events/{id}` | cliente (`addGuest`/bulk/`updateGuest`) + servidor (`registerWalkInGuest`) | **Alto** | Es un GATE de capacidad (`attendeeLimit.ts`); alta masiva o auto-registro público puede concentrarse en ráfagas |
| `checkedInCount` | `events/{id}` | igual que `occupancyCount` | **Alto** | Mismo documento, misma transacción que `occupancyCount`, mismo volumen de escritura en la puerta |
| `checkinsByHour.{hora}` | `events/{id}` (mapa) | servidor, misma transacción que `checkedInCount` | **Medio** | Se reparte en ~24 buckets, pero el bucket de "puerta abre" concentra el pico igual que `checkedInCount` |
| `paidCount` | `events/{id}` | servidor (`confirmPayment`) | **Medio** | Alto volumen solo en confirmación masiva de pagos (bulk), no en check-in en tiempo real |
| `guestCount`, `rsvpYesCount`/`rsvpNoCount`/`rsvpPendingCount` | `events/{id}` | cliente, altas/RSVP | **Bajo-Medio** | Se escriben en altas individuales o import CSV (ya troceado en chunks), no en la ráfaga de la puerta |
| `stockRemaining`/`soldCount` (concesiones) | `events/{id}/concessionsCatalog/{itemId}` | servidor (`createConcessionOrder`/`cancelConcessionOrder`) | **Medio** | Documento por ítem (no por evento) acota el radio, pero un ítem muy popular puede calentarse; `stockRemaining` usa lectura+escritura de valor absoluto (gate), no `increment()` puro — no entra en esta abstracción todavía (ver §10) |
| `reactionCount`/`reactionCountsByType` | `events/{id}/{wall\|photos}/{docId}` | cliente | **Bajo** | Por post individual, no por evento; un post viral es un caso acotado |
| `warningsCount` | `sanctions/{uid}` | cliente | **Bajo** | Por usuario, nunca recibe escrituras concurrentes masivas |
| `capacity` | `events/{id}` | — | **N/A** | No es un contador — es un techo estático, se escribe una sola vez al crear/editar el evento |

**Alcance de esta entrega**: los 8 contadores de `events/{id}` (los primeros
6 de la tabla) entran al `CounterService`. Concesiones, reacciones y
sanciones quedan fuera — ver §10 (candidatos de Fase 2).

**Ningún contador tiene evidencia real de contención hoy** — todos siguen en
`traditional`. Esta arquitectura existe para poder activar sharding rápido
el día que la evidencia (§8) lo justifique, no para activarlo ahora.

## 3. Arquitectura

Patrón de "contador con caché denormalizada + shards opcionales" (variante
del sharded counter oficial de Firestore, combinado con una caché
recalculada — la misma idea que ya sugería BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §8.1).

Tres estrategias por contador (`CounterStrategy`, configuradas en
`COUNTER_REGISTRY`):

- **`traditional`** (todos, hoy): el campo en `events/{id}` es la única
  fuente de verdad. Comportamiento idéntico al código anterior a esta
  entrega.
- **`sharded`**: la fuente de verdad pasa a
  `events/{id}/counterShards/{contador}_{0..N-1}` — cada escritura pega en
  un shard elegido al azar (`set({value: increment(delta)}, {merge: true})`,
  auto-crea el shard). El campo plano en `events/{id}` se conserva como
  **caché de solo lectura**, resincronizada por
  `reconcileShardedCounterCache.ts` (job diario), para que dashboards,
  reportes y la agregación cross-evento (`src/firebase/admin.ts`,
  `sum('checkedInCount')` sobre toda la colección `events`) sigan
  funcionando **sin ningún cambio**.
- **`dual`** (estado de migración): escribe en AMBOS (campo plano + shards),
  sigue leyendo del campo plano. Sirve para calentar los shards y validar
  que la suma coincide antes del corte real a `sharded`.

```
Escritura (applyCounterDeltas)
  │
  ├─ traditional/dual → un único update() sobre events/{id}.{contador}
  │                      (agrupa varios contadores en la MISMA llamada,
  │                      mismo costo de escritura que antes)
  │
  └─ dual/sharded → set() con merge+increment sobre un shard random
                     events/{id}/counterShards/{contador}_{n}

Lectura (getCounterTotal, dentro de una transacción)
  │
  ├─ traditional/dual → lee events/{id}.{contador} directo (o reusa un
  │                      snapshot ya leído en la misma transacción)
  │
  └─ sharded → suma TODOS los shards dentro de la MISMA transacción
                (correcto, no gratis — ver §5)
```

### Contadores "gate"

`occupancyCount` y `peopleCount` están marcados `gated: true` — se leen
dentro de una transacción para decidir si una operación cabe (`walkIn`,
`addGuest`, `registerWalkInGuest`). Bajo `sharded`, esa lectura de decisión
tiene que sumar todos los shards **dentro de la misma transacción** para
seguir siendo consistente. Es correcto, pero no gratis: ver §5.

## 4. API unificada

Dos módulos gemelos (mismo criterio que `attendeeLimit.ts` ya usa entre
cliente/servidor — proyectos TypeScript separados, sin paquete compartido):

- Cliente: `src/firebase/counters/`
- Cloud Functions: `functions/src/lib/counters/`

```ts
// Escritura — agrupa uno o más contadores en una sola operación lógica.
// Bajo traditional/dual, todos los que compartan esa estrategia se funden
// en un único writer.update(). extraFields (solo backend) fusiona campos NO
// contador (p.ej. checkinsByHour.{hora}) en el MISMO update — Firestore no
// permite dos updates separados al mismo documento en una transacción.
applyCounterDeltas(writer, eventRef, { checkedInCount: 1, occupancyCount: 1 })

// Lectura consistente — la única forma válida de leer un contador "gate"
// antes de decidir si algo cabe.
const total = await getCounterTotal(tx, eventRef, 'occupancyCount', eventSnap)

// Inicialización (alta de evento, migración, tests).
initializeCounters(writer, eventRef, { checkedInCount: 0, occupancyCount: 0 })
```

El resto del sistema (checkIn.ts, guests.ts, confirmPayment.ts, etc.) llama
estas tres funciones sin saber qué estrategia tiene cada contador — eso vive
únicamente en `COUNTER_REGISTRY` (`config.ts`).

## 5. Cuándo usar sharded counters — y cuándo NO

**Usarlos cuando**: el contador recibe muchas escrituras concurrentes y se
**lee de forma aproximada/poco frecuente** (dashboards, reportes, un total
que no necesita ser exacto al milisegundo). Es el caso de `checkedInCount`
si algún día se activa: sube mucho en la puerta, se lee para mostrar "N
personas ingresaron" — un poco de staleness en la caché es aceptable.

**NO usarlos (o hacerlo con mucho cuidado) cuando el contador es un GATE**
— decide si una operación se acepta o se rechaza (`occupancyCount` en
`walkIn`, `peopleCount` en `addGuest`/`registerWalkInGuest`,
`stockRemaining` en concesiones). Shardear un gate no elimina la
contención, la **mueve**: la transacción que decide "¿cabe?" tiene que leer
TODOS los shards de forma consistente, así que sigue compitiendo con
cualquier transacción que esté escribiendo en cualquiera de esos shards en
ese instante — el cuello de botella de escritura se convierte en un cuello
de botella de lectura+escritura combinado, sin ninguna ganancia neta, y con
el riesgo nuevo de leer un total ligeramente viejo si no se hace bien. La
técnica correcta para escalar un gate de admisión no es sharding — es
sobreaprovisionar el margen de capacidad, o migrar a admisión optimista con
reconciliación posterior (ver `CAPACITY_LIMIT_ARCHITECTURE.md`). Por eso
`occupancyCount`/`peopleCount` quedan en `traditional` por defecto aunque
estén clasificados como riesgo Alto — la mitigación real para ellos no es
esta arquitectura.

**Tampoco vale la pena** para contadores de bajo volumen (`guestCount`,
`rsvpYesCount`, etc.) mientras no haya evidencia — el costo de leer N shards
en vez de 1 campo es puro overhead sin beneficio si nunca hay contención.

## 6. Costos

| Operación | Traditional | Sharded/Dual |
|---|---|---|
| Escritura de 1 contador | 1 escritura documentada | 1 escritura (al shard) + 1 más si es `dual` (al campo plano) |
| Escritura de varios contadores juntos | 1 escritura (se funden en un `update()`) | 1 escritura por contador shardeado + 1 escritura fundida para los que sigan `traditional` |
| Lectura para dashboards/reportes | 1 lectura | 1 lectura (de la caché — sin cambio) |
| Lectura de gate dentro de una transacción | 1 lectura | N lecturas (una por shard) — ver §5 |
| Job de reconciliación de caché | no aplica | 1 lectura por evento × contadores activos, diaria — no-op (costo ~0) mientras ningún contador esté en `dual`/`sharded` |

Firestore cobra por documento leído/escrito, no por "operación lógica" — un
contador con `shardCount: 10` en modo `sharded` puede costar hasta 10x más
en lecturas de gate que el mismo contador en `traditional`. Por eso el
`shardCount` de la config (10 por defecto) es un punto de partida
conservador, no un valor mágico — ajustarlo según el volumen real medido.

## 7. Limitaciones conocidas

- **`guestCount`/`peopleCount` en `registerWalkInGuest.ts`** (auto-registro
  público) se escriben como **valor absoluto**, no como delta — por el
  fallback a eventos legacy sin `peopleCount` (ver comentario en el
  archivo). Este call site puntual NO pasa por `applyCounterDeltas` para
  esos dos campos (si pasara, un `increment()` sobre un campo ausente
  arrancaría en 0, perdiendo el fallback). Antes de migrar `peopleCount` a
  `dual`/`sharded`, este call site necesita revisarse (backfill de eventos
  legacy + conversión a delta puro).
- **Gate reads con fallback legacy** (`src/firebase/guests.ts`,
  `remainingCapacity`): la lectura de `peopleCount` con su fallback a
  `guestCount` para eventos legacy sigue siendo un `data.peopleCount`
  directo, no pasa por `getCounterTotal`. Migrar `peopleCount` a `sharded`
  requiere actualizar también estos call sites de lectura (grep por
  `remainingCapacity(` en `src/firebase/guests.ts` y
  `functions/src/capacity/registerWalkInGuest.ts`).
- **`checkinsByHour`** (histograma por hora) siempre es `traditional` —
  shardear un mapa por clave dinámica agrega complejidad
  desproporcionada para un campo que ya reparte el volumen en ~24 buckets.
- **Reglas de Firestore para `counterShards`**: no existen todavía (no
  hacen falta mientras ningún contador esté en `dual`/`sharded`). Antes de
  activar cualquiera de esos modos en un contador que además se escribe
  desde el CLIENTE (`checkedInCount`/`occupancyCount` en `walkIn`/`walkOut`,
  los de `guests.ts`), agregar una regla para esa subcolección es un paso
  obligatorio — hoy cualquier escritura de cliente a
  `events/{id}/counterShards/*` es rechazada por el deny-by-default de
  `firestore.rules`.
- **`stockRemaining`/`soldCount` de concesiones** no entran en este
  registro (dominio y patrón de escritura distintos — ver tabla de riesgo).

## 8. Observabilidad

`functions/src/lib/counters/observability.ts` — solo escribe logs cuando un
contador está en `dual`/`sharded` (shard escrito, o drift detectado entre
caché y suma real). Bajo `traditional` (el 100% de los contadores hoy) esta
función nunca se invoca — cero costo/ruido agregado en el camino caliente de
check-in/pago.

Filtrar en Cloud Logging con `jsonPayload.type="sharded_counter_observation"`.
Campos: `counter`, `eventId`, `strategy`, `shardsWritten`,
`cacheDriftDetected`.

**Métricas a vigilar antes de decidir activar sharding en un contador**
(objetivo del punto anterior — la arquitectura ya está lista, falta la
evidencia):

- Latencia p95/p99 de las transacciones que escriben `checkedInCount`/
  `occupancyCount` (Cloud Monitoring, filtrando por el nombre de la Cloud
  Function `checkInGuest`/`confirmPaymentAndCheckIn`).
- Tasa de reintentos de transacción por conflicto (`ABORTED` en los logs de
  Firestore) durante eventos grandes.
- Tamaño de evento (personas esperadas) vs. latencia observada — para
  encontrar el umbral real, no uno teórico.

## 9. Estrategia de migración de un contador puntual

Herramientas en `functions/src/lib/counters/migration.ts`, pensadas para
correrse a mano (nunca automático) sin detener el servicio:

1. **Sembrar shards**: `seedShardsFromCurrentValue(db, eventId, counter)` —
   crea los N shards con el valor actual del campo plano (todo en el shard
   0). Solo crea documentos nuevos, seguro con el servicio corriendo.
2. **Pasar a `dual`** en `COUNTER_REGISTRY` (edit + deploy) — a partir de
   acá cada escritura real actualiza campo plano Y shards.
3. **Validar repetidamente**: `validateShardsAgainstCache(db, eventId,
   counter)` — compara la suma de shards contra el campo plano. Correr
   varias veces durante el período de `dual` (horas o días, según el
   volumen de escritura del contador).
4. **Pasar a `sharded`** (edit + deploy) solo si la validación fue
   consistente — a partir de acá el campo plano pasa a ser una caché,
   resincronizada por `reconcileShardedCounters` (job diario).
5. **Rollback**: en cualquier momento mientras el contador siga en
   `traditional`, `deleteCounterShards(db, eventId, counter)` limpia los
   shards sembrados. Volver de `dual`/`sharded` a `traditional` es un
   simple edit + deploy de `COUNTER_REGISTRY` (el campo plano nunca dejó de
   estar actualizado en `dual`).
6. **Retirar el sistema anterior**: no aplica acá — el campo plano nunca se
   elimina (es la caché de compatibilidad permanente para dashboards/
   reportes/agregación cross-evento).

## 10. Candidatos para migración inmediata

**Ninguno.** Ningún contador tiene evidencia real de contención en
producción hoy (ver §8 para qué medir). Esta entrega deja la arquitectura
lista y probada, no activa sharding en nada — es intencional, ver
`BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §8.1` y el resto de RFCs del
proyecto, que coinciden en el mismo criterio.

**Fase 2 (fuera de esta entrega), si aparece evidencia real:**
`stockRemaining`/`soldCount` de concesiones (requiere adaptar el patrón de
lectura+escritura de valor absoluto) y `reactionCount` (requiere su propio
registro, dominio distinto a `events/{id}`).

## 11. Ejemplos de uso

```ts
// Backend — check-in exitoso (functions/src/checkin/checkIn.ts)
applyCounterDeltas(
  db, tx, eventRef, eventId,
  { occupancyCount: partySize, checkedInCount: isReentry ? 0 : partySize },
  buildHourlyCheckinPatch(checkinHourLabel()),
)

// Backend — lectura de gate antes de aceptar un pago/check-in combinado
const currentOccupancy = await getCounterTotal(db, tx, eventRef, eventId, 'occupancyCount', eventSnap)

// Cliente — walk-in (src/firebase/capacity.ts)
applyCounterDeltas(tx, eventRef, { checkedInCount: 1, occupancyCount: 1 })
```

## 12. Checklist antes de activar un contador shardeado

- [ ] Hay métricas de producción (Cloud Monitoring) mostrando contención
      real en ese contador puntual — no una hipótesis.
- [ ] El contador NO es un gate (`gated: false` en el registro) — o, si lo
      es, se evaluó explícitamente el trade-off de §5 y se decidió que vale
      la pena igual.
- [ ] Si el contador se escribe desde el cliente (no solo Cloud Functions),
      existe una regla de `firestore.rules` para
      `events/{id}/counterShards/*` (ver §7).
- [ ] Si el contador tiene un call site con escritura de valor absoluto
      (como `registerWalkInGuest.ts` para `peopleCount`/`guestCount`), ese
      call site se revisó y convirtió a delta puro.
- [ ] Se corrió `seedShardsFromCurrentValue` y al menos una ronda de
      `validateShardsAgainstCache` sin drift.
- [ ] `reconcileShardedCounters` (scheduled) está deployado — corre gratis
      mientras no haga falta, pero tiene que existir antes de depender de
      la caché.
- [ ] Se corrió `scripts/load-test-counters.mjs` contra el emulador para
      tener una referencia de la forma esperada de la curva de latencia.
