# Observabilidad del backend (Cloud Functions)

Este documento describe el sistema de logging estructurado, reporte de
errores y métricas del backend de PaseLink (`functions/src`, Cloud
Functions v2). Proyecto de GCP: **`app-pases-9e6e7`**.

## 1. Arquitectura

```
Callable / Scheduled / Trigger
        │
        ▼
withCallableObservability() / withScheduledObservability() / withTriggerObservability()
  (functions/src/lib/observability/withObservability.ts)
        │
        ├─ createRequestContext()  → requestId, functionName, uid/eventId/guestId
        ├─ createLogger(ctx)       → logger.info/warn/error() estructurado
        ├─ ejecuta el handler original (lógica de negocio sin cambios)
        ├─ clasifica el resultado: éxito / error esperado / error inesperado
        └─ mide duración total (advierte si supera 1000ms)
        │
        ▼
firebase-functions/logger.write()  →  JSON a stdout/stderr
        │
        ▼
   Cloud Logging (jsonPayload filtrable)
        │
        ├─→ Log Explorer / `firebase functions:log` (consulta manual)
        ├─→ Cloud Error Reporting (automático, solo severidad ERROR+ con stack)
        └─→ Log-based Metrics → Cloud Monitoring → dashboards/alertas (a configurar)
```

**Nada de esto requirió dependencias nuevas.** `firebase-functions/logger`
ya viene incluido en el paquete `firebase-functions` (solo estaba sin usar);
Cloud Error Reporting ingiere automáticamente cualquier log con severidad
`ERROR`+ que incluya un stack trace — comportamiento nativo de Cloud
Functions v2 (corre sobre Cloud Run), sin SDK ni configuración adicional.

Los archivos del módulo (`functions/src/lib/observability/`):

| Archivo | Qué hace |
|---|---|
| `context.ts` | `RequestContext`: requestId (`crypto.randomUUID()`), functionName, campos acumulables (uid/eventId/guestId/...), cronómetro. |
| `logger.ts` | `createLogger(ctx)` → logger estructurado ligado al contexto. Serializa `Error` en los campos (si no, `JSON.stringify(new Error())` da `{}`). |
| `errors.ts` | Clasifica errores esperados (reglas de negocio) vs. inesperados (bugs/infra) y genera un `HttpsError('internal', ...)` seguro para el cliente cuando aplica. |
| `businessEvents.ts` | `logBusinessEvent()` + catálogo tipado de eventos de negocio. |
| `performanceTimer.ts` | Cronómetro standalone (`startTimer()`) para sub-operaciones puntuales, y el umbral de "operación lenta" (1000ms). |
| `withObservability.ts` | Los tres middlewares: `withCallableObservability`, `withScheduledObservability`, `withTriggerObservability`. |

## 2. Niveles de logging

| Nivel | Cuándo se usa | ¿Llega a Error Reporting? |
|---|---|---|
| `DEBUG` | Detalle interno opcional, no se usa hoy en el código base. | No |
| `INFO` | Inicio/éxito de cada invocación, eventos de negocio. | No |
| `WARNING` | Errores **esperados** (`HttpsError` de reglas de negocio: `invalid-argument`, `not-found`, `permission-denied`, `unauthenticated`, `failed-precondition`, `already-exists`, `resource-exhausted`, `out-of-range`) y advertencias de operación lenta (>1000ms). | No — es ruido esperado, no un bug. |
| `ERROR` | Cualquier error que **no** sea uno de los códigos de arriba: bugs, fallas de Firestore/red, `HttpsError('internal'/'unavailable'/...)`. Siempre incluye stack trace. | **Sí, automáticamente.** |

Esta clasificación vive en `errors.ts` (`isExpectedError`) — nunca hay que
decidirla a mano en cada función, el middleware ya lo hace.

## 3. Cómo consultar logs

**Firebase CLI** (rápido, para desarrollo):
```bash
firebase functions:log --only checkInGuest
```

**Cloud Logging (Log Explorer)** — https://console.cloud.google.com/logs/query?project=app-pases-9e6e7

Ejemplos de queries (todas usan `jsonPayload`, no el texto del mensaje,
porque el logging es estructurado):

```
# Todos los logs de una función puntual
resource.type="cloud_run_revision"
jsonPayload.functionName="checkInGuest"

# Todos los logs de una invocación específica (útil para seguir un
# request de punta a punta, incluidos los de la propia función que
# invocó a otra)
jsonPayload.requestId="<uuid>"

# Todo lo que pasó con un evento puntual
jsonPayload.eventId="<eventId>"

# Todo lo que pasó con un invitado puntual
jsonPayload.guestId="<guestId>"

# Solo eventos de negocio (para armar un dashboard de actividad)
jsonPayload.type="business_event"
jsonPayload.event="checkin_success"

# Operaciones lentas
jsonPayload.slowOperation=true

# Solo errores inesperados
severity="ERROR"
```

## 4. Cómo buscar errores

**Cloud Error Reporting** — https://console.cloud.google.com/errors?project=app-pases-9e6e7

Agrupa automáticamente por stack trace. Cada grupo muestra: primera/última
ocurrencia, cantidad de eventos, y el `requestId`/`functionName` (quedan en
el `jsonPayload` del log asociado, visible al abrir el evento).

**No van a aparecer acá**: errores esperados (`invalid-argument`,
`not-found`, `permission-denied`, etc.) — son WARNING, no ERROR, a
propósito, para que Error Reporting quede limpio y solo muestre bugs reales.

## 5. Cómo agregar nuevos logs

Dentro de cualquier handler ya envuelto, `ctx.logger` está disponible:

```ts
export const miFuncion = onCall<Input>((request) =>
  withCallableObservability(request, 'miFuncion', async (ctx) => {
    const { eventId, guestId } = request.data
    ctx.addContext({ uid: request.auth?.uid, eventId, guestId }) // se refleja en TODOS los logs siguientes de esta invocación

    ctx.logger.info('Algo relevante pasó', { detalle: 'valor' })
    // ...
  }),
)
```

### Agregar una función nueva (Callable/Scheduled/Trigger)

```ts
// Callable
export const miFuncion = onCall<Input>((request) =>
  withCallableObservability(request, 'miFuncion', async (ctx) => { /* ... */ }),
)

// Scheduled
export const miBarrido = onSchedule(opts, () =>
  withScheduledObservability('miBarrido', async (ctx) => { /* ... */ }),
)

// Trigger de Firestore
export const miTrigger = onDocumentCreated(opts, (event) =>
  withTriggerObservability(event, 'miTrigger', async (ctx) => { /* ... */ }),
)
```

Notar el patrón: se **llama** al middleware dentro de un arrow function que
ya recibe `request`/`event` tipado por el propio `onCall`/`onSchedule`/
`onDocumentX` — no se envuelve el handler completo. Esto mantiene la
inferencia de tipos de TypeScript funcionando exactamente igual que antes
(sin anotaciones manuales) y evita ambigüedad de tipos entre capas
genéricas.

### Agregar un evento de negocio nuevo

1. Agregar la constante en `BUSINESS_EVENTS` (`businessEvents.ts`).
2. Llamar `logBusinessEvent(ctx.logger, BUSINESS_EVENTS.MI_EVENTO, { ...campos })` en el punto del código donde ese evento ocurre de verdad (después de confirmado, no antes de validar).

## 6. Convenciones de campos

| Campo | Tipo | Cuándo aparece |
|---|---|---|
| `requestId` | string (UUID) | Siempre — identifica una invocación completa. |
| `functionName` | string | Siempre — nombre exacto exportado (`checkInGuest`, `reconcileGuestCounters`, etc.). |
| `severity` | `INFO`\|`WARNING`\|`ERROR`\|`DEBUG` | Siempre. |
| `timestamp` | string ISO-8601 | Siempre (además del timestamp de ingesta que agrega Cloud Logging). |
| `uid` | string | Cuando hay usuario autenticado. |
| `eventId` | string | Cuando la operación es sobre un evento puntual. |
| `guestId` | string | Cuando la operación es sobre un invitado puntual. |
| `durationMs` | number | En el log de cierre (éxito o error) de cada invocación. |
| `responseSizeBytes` | number | En el log de éxito de Callables (tamaño aproximado de la respuesta JSON). |
| `slowOperation` | `true` | Solo en la advertencia WARNING cuando `durationMs > 1000`. |
| `type` | `"business_event"` | Solo en logs de métricas de negocio. |
| `event` | string | Nombre del evento de negocio (ver `BUSINESS_EVENTS`). |
| `error` | `{ name, message, stack }` | Solo en logs ERROR/WARNING de fallas — nunca un `Error` crudo (se pierde en JSON). |
| `code` | string | Código de `HttpsError` en errores esperados. |

No inventar sinónimos de estos campos — si hace falta uno nuevo, se agrega
a esta tabla.

## 7. Métricas disponibles

**Automáticas, ya emitidas por todas las funciones:**
- Duración por invocación (`durationMs`).
- Marca de operación lenta (`slowOperation: true` cuando supera 1000ms).
- Tamaño aproximado de la respuesta de cada Callable (`responseSizeBytes`).
- Conteo de invitados/eventos procesados en operaciones masivas — se toma
  de lo que la función ya devuelve (p. ej. `bulkSetGuestPaymentStatus` loguea
  `guestCount`/`failedCount`; `reconcileGuestCounters` loguea
  `eventsChecked`/`eventsUpdated`).

**Eventos de negocio** (`jsonPayload.type="business_event"`), alcance
actual — solo lo que ya pasa por una Cloud Function hoy:

- `checkin_success` / `checkin_rejected`
- `payment_registered` / `payment_confirmed`
- `guest_added_walkin`
- `guest_promoted_from_waitlist`
- `concession_order_created` / `concession_order_cancelled`

### Brecha conocida — eventos de negocio NO cubiertos

`evento creado`, `evento publicado`, `evento cancelado`, `invitado
agregado`/`eliminado` desde la UI normal (no walk-in), e `invitación
enviada` ocurren hoy vía **escritura directa del frontend a Firestore**, sin
pasar por ninguna Cloud Function — no hay backend que instrumentar para
esos casos sin cambiar la arquitectura actual (agregar Cloud Functions
nuevas de solo-logging fue evaluado y descartado en esta iteración por
costo/superficie adicional en Blaze; ver decisión registrada en el
historial del proyecto). Si se necesita cerrar esta brecha a futuro, la
opción más simple es instrumentar esos flujos del lado del cliente
(breadcrumbs/eventos custom de Sentry, que el frontend ya tiene integrado).

### Límite conocido — lecturas/escrituras de Firestore por operación

No se cuentan automáticamente por operación: instrumentarlas requeriría
interceptar el SDK de Firestore de forma global o agregar contadores dentro
de cada servicio de negocio (`checkin/`, `capacity/`, `payments/`,
`waitlist/`, `reconciliation/`, etc.), lo que arriesga romper
`batch()`/`runTransaction()` o tocar lógica de negocio que debía quedar
intacta en esta iteración. En cambio, el conteo **autoritativo por base de
datos** ya existe gratis, sin código, en Cloud Monitoring:

- `firestore.googleapis.com/document/read_count`
- `firestore.googleapis.com/document/write_count`
- `firestore.googleapis.com/document/delete_count`

Consultables en https://console.cloud.google.com/monitoring/metrics-explorer?project=app-pases-9e6e7

## 8. Cómo configurar alertas (Google Cloud Console)

Nada de esto está configurado todavía — son pasos a seguir manualmente
cuando se decida activarlas (ninguno requiere credenciales ni cambios de
código).

### 8.1. Log-based Metrics (previo a las alertas)

En https://console.cloud.google.com/logs/metrics/add?project=app-pases-9e6e7,
crear:

1. **`functions_error_rate`** — tipo "Counter". Filtro: `severity="ERROR"`. Label opcional por `jsonPayload.functionName` para poder alertar función por función.
2. **`functions_slow_operations`** — tipo "Counter". Filtro: `jsonPayload.slowOperation=true`.
3. **`functions_duration`** — tipo "Distribution". Filtro: `jsonPayload.durationMs>0`. Valor a extraer: `jsonPayload.durationMs`. Esto permite alertar sobre percentiles (p95/p99), no solo promedio.

### 8.2. Políticas de alerta (Cloud Monitoring)

En https://console.cloud.google.com/monitoring/alerting/policies/create?project=app-pases-9e6e7,
usando las métricas de arriba (o las métricas nativas de Cloud Functions,
`cloudfunctions.googleapis.com/function/execution_count` con
`status!="ok"`):

| Alerta | Condición sugerida | Umbral de referencia |
|---|---|---|
| Aumento de errores | `functions_error_rate` — suma en ventana de 5 min | > 10 errores en 5 min, o > 5% de las invocaciones |
| Latencia elevada | `functions_duration` p95 | > 3000ms sostenido por 10 min |
| Función con fallos repetidos | Métrica nativa `cloudfunctions.googleapis.com/function/execution_count`, filtrada por `status!="ok"`, agrupada por función | > 5 fallos consecutivos de la misma función en 15 min — crítico para `checkInGuest`/`confirmPaymentAndCheckIn` (camino del escáner) |
| Invocaciones anómalas (posible loop/abuso) | Métrica nativa `execution_count` | > 3x el promedio de los últimos 7 días para la misma hora |
| Uso elevado de Firestore | `firestore.googleapis.com/document/write_count` | > umbral que se ajuste tras ver una semana de tráfico real — evita alertar sobre el propio pico de un evento grande |

Canal de notificación recomendado: reusar el mismo webhook de Discord que
ya existe para uptime/deploy-fallido (ver alertas de Fase 4 del proyecto),
para no fragmentar dónde el equipo mira las alertas.

## 9. Cómo monitorear costos

### 9.1. Presupuesto y alertas de costo (Cloud Billing)

En https://console.cloud.google.com/billing/budgets?project=app-pases-9e6e7:

1. "Crear presupuesto" → alcance: proyecto `app-pases-9e6e7` (o toda la cuenta de facturación si se comparte con otros proyectos).
2. Monto de referencia: empezar con un presupuesto mensual conservador acorde al plan Blaze de una app en esta escala (uso bajo/medio, la mayoría de servicios dentro de la capa gratuita) — ajustar tras el primer mes real de datos en vez de adivinar un número.
3. Umbrales de alerta recomendados: 50%, 90% y 100% del presupuesto — notificando por email a quien administra el proyecto.
4. Opcional: "Vincular una acción" para desactivar automáticamente servicios no esenciales al 100% — **no recomendado** para PaseLink en producción (cortaría el servicio a usuarios reales); mejor solo alertar.

### 9.2. Qué mirar por servicio

En https://console.cloud.google.com/billing/app-pases-9e6e7/reports (desglosado por SKU):

- **Cloud Functions**: invocaciones, GB-segundos (memoria × duración), tiempo de CPU. `checkInGuest`/`confirmPaymentAndCheckIn` tienen `minInstances: 1` — generan costo base fijo incluso sin tráfico, vigilar que siga siendo la excepción y no la norma.
- **Firestore**: lecturas, escrituras, eliminaciones, almacenamiento, ancho de banda de red saliente. Es típicamente el mayor costo variable en una app con lectura frecuente (listas de invitados, dashboards).
- **Cloud Storage**: almacenamiento (fotos de evento/perfil) + operaciones de clase A/B + egreso de red.
- **Authentication**: gratis hasta 50k MAU (verificaciones por teléfono/SMS son la única parte paga — PaseLink no usa login por teléfono hoy).
- **Ancho de banda / egreso de red**: suele ser invisible hasta que un evento grande genera mucho tráfico de fotos/QRs simultáneo — vigilar junto con Storage.

Límites de referencia razonables para la escala actual de PaseLink (ajustar
con datos reales, no quedarse con estos para siempre): alertar si
Firestore supera unas pocas decenas de miles de lecturas/escrituras por
día en un período sin eventos grandes en curso, y revisar manualmente el
desglose de costos cada vez que un evento con cientos de invitados
concurrentes termine.
