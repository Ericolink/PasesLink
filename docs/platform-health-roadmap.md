# Roadmap: Salud de la plataforma (Centro de Control admin)

Este documento explica qué quedó **implementado con datos reales** en el
Centro de Control (`/admin`, macro-tab "Centro de Control") y qué queda
**deliberadamente diferido**, con el motivo. Regla seguida en toda la
iteración: nunca mostrar un dato simulado o inventado — si no había una
fuente real, la sección queda vacía/"sin datos" en vez de fingir un valor.

## 1. Qué existe hoy

| Sección | Fuente real | Dónde |
|---|---|---|
| Alertas inteligentes | `sendLog`/`notificationQueue`/`csvImportJobs` (collectionGroup, status `failed`) + `sendBudget/{hoy}` vs. cap diario | `src/firebase/adminAlerts.ts`, `src/hooks/useAdminAlerts.ts` |
| **Salud de la plataforma** | Cloud Function programada `refreshPlatformHealth` (cada 15 min) → API de Sentry + API de Cloud Monitoring → `platformStats/health` | `functions/src/scheduled/refreshPlatformHealth.ts`, `src/components/Admin/ControlCenter/PlatformHealthPanel.tsx` |
| Crecimiento | Series diarias de `events`/`users` (30 días, agregación server-side) | `src/firebase/admin.ts` (`getEventStatsTimeSeries`/`getUserStatsTimeSeries`) |
| Funnel de activación | `users` totales + `platformStats/funnel.usersWithEventsCount` (mantenido por trigger) + `events` con `guestCount`/`rsvpYesCount`/`checkedInCount` > 0 | `src/firebase/platformFunnel.ts`, `functions/src/triggers/onEventCreated.ts` |
| Actividad en tiempo real | Listeners en vivo sobre `users`/`events`/`guests` (collectionGroup) | `src/firebase/adminActivity.ts` |
| Analítica de uso (plantillas, coorganizadores) | `events` ya cargado por el shell de `/admin`, agrupado en memoria | `src/hooks/useUsageAnalytics.ts` |
| Dispositivos (SO/navegador) | Contadores agregados (`deviceStats/{bucket}`), incrementados en cada login | `src/firebase/deviceStats.ts`, `src/firebase/auth.ts` |

### Salud de la plataforma — cómo funciona

`refreshPlatformHealth` (Opción A de la versión anterior de este doc, ya
implementada) corre cada 15 minutos y resuelve 4 señales **en paralelo**,
cada una con su propio try/catch — si una falla (permiso no otorgado
todavía, token sin configurar), las otras 3 igual se escriben:

1. **Cloud Functions** — vía Cloud Monitoring: cantidad de ejecuciones, tasa
   de error y latencia p95 de los últimos 15 min. Semáforo: verde <1% error,
   amarillo 1-5%, rojo ≥5% (`classifyFunctionsHealth` en `cloudMonitoring.ts`).
2. **Errores (Sentry)** — cantidad de issues sin resolver en las últimas 24h
   del proyecto Sentry `paselink`. Semáforo: verde 0, amarillo 1-9, rojo 10+
   (`classifySentryHealth` en `sentryHealth.ts`).
3. **Firestore** — lecturas/escrituras/eliminaciones de los últimos 15 min.
   **Sin semáforo a propósito** — es una señal de uso/costo, no de salud;
   ponerle un umbral rojo/amarillo sin datos históricos de referencia sería
   inventar una alerta.
4. **Storage** — tamaño total del bucket por defecto. Tampoco lleva semáforo,
   mismo motivo que Firestore.

El cliente (`PlatformHealthPanel.tsx`) solo escucha `platformStats/health`
vía `onSnapshot` (ya cubierto por la regla `platformStats/{document=**}`,
`allow read: if isAdmin()` desde la primera iteración) — nunca ve
credenciales de GCP/Sentry.

**"Usuarios conectados" y "tiempo de respuesta promedio" del pedido
original NO están cubiertos** — ver §3 (Opción C, presence) más abajo, esa
pieza sigue diferida.

## 2. Cómo activarlo (pasos manuales, no automatizables desde acá)

Sin esto, `refreshPlatformHealth` corre igual pero las 4 señales fallan y el
panel queda en "Todavía no hay datos" o con cada tarjeta en "No se pudo leer
esta señal".

### 2.1 Token de la API de Sentry
1. sentry.io → Settings → Auth Tokens → **Create New Token**.
2. Scopes: `project:read`, `event:read` (alcanza para el endpoint de
   issues que usa `getSentryHealth`).
3. Subirlo a Secret Manager (no a GitHub Actions — es un secret de Firebase
   Functions, distinto de `SENTRY_AUTH_TOKEN` que ya existe para sourcemaps):
   ```bash
   firebase functions:secrets:set SENTRY_API_TOKEN
   ```
4. Confirmar que el slug de organización/proyecto en
   `functions/src/scheduled/refreshPlatformHealth.ts` (`SENTRY_ORG_SLUG`/
   `SENTRY_PROJECT_SLUG`, hoy `'paselink'`/`'paselink'`) coincide con los
   reales — verificar en la URL de sentry.io (`sentry.io/organizations/<org>/projects/<project>/`).

### 2.2 Permiso de Cloud Monitoring
El service account con el que corren las Cloud Functions necesita el rol
`roles/monitoring.viewer` en el proyecto GCP:
1. Confirmar cuál es esa cuenta: Google Cloud Console → Cloud Functions →
   abrir cualquier función → pestaña "Detalles" → "Cuenta de servicio de
   ejecución" (por defecto suele ser
   `<NÚMERO_DE_PROYECTO>-compute@developer.gserviceaccount.com`).
2. Otorgar el rol:
   ```bash
   gcloud projects add-iam-policy-binding app-pases-9e6e7 \
     --member="serviceAccount:LA_CUENTA_QUE_VISTE_EN_CONSOLA" \
     --role="roles/monitoring.viewer"
   ```

### 2.3 Verificar los nombres de métrica
Los filtros de `cloudMonitoring.ts` (`cloudfunctions.googleapis.com/function/execution_count`,
`firestore.googleapis.com/document/read_count`, `storage.googleapis.com/storage/total_bytes`,
etc.) siguen la documentación pública de GCP pero **no se pudieron probar
contra el proyecto real** desde el entorno donde se escribió este código
(sin acceso a `gcloud`/Cloud Monitoring). Si después de desplegar y
esperar ~15-30 min alguna tarjeta sigue en "No se pudo leer esta señal",
revisar los logs de `refreshPlatformHealth` (`firebase functions:log
--only refreshPlatformHealth`) y, si el error es de filtro/métrica
inexistente, confirmar el nombre correcto en GCP Console → Monitoring →
Metrics Explorer, filtrando por el mismo `resource.type`, y ajustar el
filtro en `cloudMonitoring.ts`.

### 2.4 Desplegar
```bash
firebase deploy --only functions:refreshPlatformHealth,firestore:rules,firestore:indexes
```

## 3. Qué sigue fuera de alcance

### Opción C — "Usuarios conectados" (presence)
Requiere Realtime Database (Firestore no tiene primitivas de presence
nativas) con `onDisconnect()`, o un heartbeat propio escrito a Firestore
cada X segundos desde el cliente mientras la pestaña está activa. Es la
pieza más cara de las señales pedidas originalmente — evaluar si vale la
pena frente a otras prioridades antes de construirla.

### "QR / Compartir / Estadísticas" como ranking de features más usadas
No hay instrumentación de uso de esas 3 funcionalidades en ningún lado (ni
Firestore ni GA4 legible). Agregar esto requeriría sumar tracking nuevo a
esas 3 acciones, decisión de producto aparte (impacto en performance/costo
de cada acción adicional a instrumentar).

### Funnel con pasos "Publicó evento" y "Compartió"
`EventStatus` no tiene un estado draft/publicado
(`'active'|'cancelled'|'archived'` únicamente), y "compartió" no se
trackea. El funnel implementado usa 5 pasos 100% reales en su lugar: Se
registró → Creó su primer evento → Agregó invitados → Recibió RSVPs → Tuvo
su primer check-in (ver `src/firebase/platformFunnel.ts`).
