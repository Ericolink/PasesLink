# Backups de Firestore

Este documento describe los **dos** mecanismos de backup de Firestore que
coexisten en PaseLink (proyecto GCP `app-pases-9e6e7`, Firestore en
`us-central1`):

1. **Sistema actual** (scripts + GitHub) — en producción desde 2026-07-06,
   sigue siendo la fuente de verdad.
2. **Sistema nativo de Google Cloud** (esta entrega) — exportaciones
   administradas de Firestore a Cloud Storage, en fase de transición,
   pensado para eventualmente reemplazar al primero.

**Ninguno de los dos se elimina ni se desactiva en esta entrega.** Ver §11
para el plan de migración.

## 1. Auditoría del sistema actual

### 1.1. Cómo funciona

```
Cloud Scheduler (GitHub Actions cron, 08:17 UTC diario)
        │
        ▼
.github/workflows/firestore-backup.yml
        │
        ├─ npm ci
        ├─ node scripts/backup-firestore.mjs ./backup-output
        │     (Admin SDK, credencial FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7)
        │     lee cada colección/collectionGroup listada a mano →
        │     backup-output/latest/<coleccion>.json
        │
        └─ git clone Ericolink/paselink-backups (privado)
              cp -r backup-output/latest → latest/
              commit + push (solo si hay diffs)
              ↑ credencial BACKUP_REPO_TOKEN (fine-grained PAT, expira al año)
```

- El repo `Ericolink/PasesLink` (este) **es público** — el backup nunca
  puede vivir ahí porque `guestContacts` contiene PII (email/teléfono de
  invitados). Por eso existe el repo privado dedicado
  `Ericolink/paselink-backups`.
- **Retención = historial de git.** Cada corrida pisa `latest/*.json` y
  comitea; no hay carpetas por fecha. Para volver a un backup de hace N
  días hay que ir al historial de commits de `paselink-backups`.
- Restauración: `scripts/restore-firestore.mjs`, dry-run por defecto,
  requiere `--yes` para escribir, siempre manual (nunca en CI).

### 1.2. Qué datos se respaldan

`scripts/backup-firestore.mjs` enumera las colecciones **a mano** en dos
arrays:

| `TOP_LEVEL_COLLECTIONS` | `SUBCOLLECTION_GROUPS` (vía `collectionGroup`) |
|---|---|
| `admins`, `users`, `events`, `feedback`, `feedbackRateLimits`, `reports`, `reportRateLimits`, `reportDedup`, `sanctions`, `adminAuditLog`, `sendBudget` | `invitations`, `guests`, `guestContacts`, `checkins`, `wall`, `photos`, `history`, `targets`, `sendLog`, `messageCampaigns` |

### 1.3. Qué datos NO se respaldan (hallazgo real de esta auditoría)

Comparando esas dos listas contra `firestore.rules` (fuente de verdad de
qué colecciones existen hoy), **9 colecciones quedan fuera del backup
actual**, todas agregadas *después* de escrito el script (2026-07-06/07):

| Colección | Tipo | Motivo probable |
|---|---|---|
| `communityTemplates` | top-level | agregada en plantillas comunitarias (2026-07-28) |
| `legalAcceptances` (bajo `users/{uid}`) | subcolección | agregada en aceptación legal (2026-07-10) |
| `tables` (bajo `events/{id}`) | subcolección | agregada en seating chart (2026-07-28) |
| `concessionsCatalog`, `concessionsOrders`, `concessionsFulfillment` (bajo `events/{id}`) | subcolecciones | agregadas en concesiones (2026-07-30) |
| `waitlist` (bajo `events/{id}`) | subcolección | agregada en lista de espera (2026-08-01) |
| `reactions` (bajo `wall/{id}` y `photos/{id}`) | subcolección | reacciones a muro/fotos |
| `notificationQueue` (bajo `events/{id}`) | subcolección | cola transitoria — omisión razonable si es intencional, pero hoy es accidental |

**Esto no es un problema puntual — es estructural.** El script no tiene
forma de detectar una colección nueva; cada feature que agrega una
colección debe *acordarse* de sumarla a mano a estos dos arrays, y nada
falla ni avisa si no lo hace. Es el riesgo más serio identificado en esta
auditoría.

### 1.4. Riesgos del sistema actual

1. **Drift de colecciones no listadas** (§1.3) — el más serio, confirmado con datos reales, no hipotético.
2. **No es un snapshot consistente.** Cada colección se lee en un instante distinto durante la corrida (~pocos segundos entre la primera y la última). Si hay escrituras concurrentes entre medio, el backup puede quedar con relaciones cruzadas inconsistentes (p. ej. un `guest` nuevo sin su `event` correspondiente si el evento se crea justo después de exportarse `events`).
3. **Formato propietario mantenido a mano.** Los `Timestamp` se serializan con una convención propia (`{__type:'timestamp', value: isoString}`) que solo `restore-firestore.mjs` sabe leer — no es un formato soportado por ninguna herramienta de Google, y cualquier cambio de esquema en la app puede requerir tocar el script de restore también.
4. **Punto único de expiración silenciosa.** `BACKUP_REPO_TOKEN` es un PAT fine-grained que expira al año. Si expira, el workflow falla, pero **no hay alerta** — a diferencia del deploy y del uptime-check (que sí postean a Discord, ver `firebase-hosting-merge.yml`/`uptime-check.yml`), `firestore-backup.yml` no notifica nada si falla. Un fallo puede pasar inadvertido semanas.
5. **Fuera del perímetro de IAM de GCP.** El backup vive en GitHub, protegido solo por ser un repo privado + el alcance del PAT — no por IAM de Google Cloud, buckets con acceso restringido, ni Cloud Audit Logs.
6. **Restauración probada una sola vez** (verificación inicial de 2026-07-07), sin ensayo periódico desde entonces.

### 1.5. Dependencias y scripts involucrados

- `scripts/backup-firestore.mjs` — export.
- `scripts/restore-firestore.mjs` — restore (dry-run por defecto).
- `.github/workflows/firestore-backup.yml` — cron `17 8 * * *` UTC + `workflow_dispatch`.
- Secrets: `FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7` (lectura de Firestore, compartido con deploy), `BACKUP_REPO_TOKEN` (push al repo privado).
- Repo externo: `Ericolink/paselink-backups` (privado).
- IAM de GCP: la cuenta `github-action-1266907845@app-pases-9e6e7.iam.gserviceaccount.com` necesita el rol **Cloud Datastore User** (gotcha ya resuelto — el Admin SDK exige este permiso de IAM además de lo que digan `firestore.rules`).

No se modifica ni se elimina nada de lo anterior en esta entrega.

## 2. Sistema nativo de Google Cloud — arquitectura

Usa la **API de exportación administrada de Firestore**
(`google.firestore.admin.v1.FirestoreAdmin.ExportDocuments`) — la misma
que invoca `gcloud firestore export`, oficial y soportada para producción
(no un mecanismo experimental). El SDK que la expone
(`@google-cloud/firestore`, reexportado como `v1` desde
`firebase-admin/firestore`) ya es una dependencia transitiva existente de
`firebase-admin` — **cero dependencias nuevas**.

```
Cloud Scheduler (creado automáticamente por cada onSchedule())
   ├─ backupFirestoreDaily    09:00 UTC diario
   ├─ backupFirestoreWeekly   09:15 UTC domingos
   └─ backupFirestoreMonthly  09:30 UTC día 1 de cada mes
        │
        ▼
Cloud Function v2 (functions/src/scheduled/backupFirestore{Daily,Weekly,Monthly}.ts)
        │
        ▼
runFirestoreExport(tier, ctx)  (functions/src/backups/exportFirestore.ts)
        │
        ├─ v1.FirestoreAdminClient().exportDocuments({ name: databasePath, outputUriPrefix, collectionIds: [] })
        │     → exporta TODAS las colecciones/subcolecciones (formato nativo de Firestore)
        │     → Operación de larga duración (LRO); Google la sigue ejecutando
        │       aunque la función termine antes
        │
        ├─ await operation.promise()   (esperamos el resultado para poder medir/loguear)
        │
        ├─ suma tamaños de los objetos escritos → approxSizeBytes
        ├─ escribe firestore-backups/metadata/<tier>/<timestamp>.json
        │
        ▼
gs://app-pases-9e6e7-firestore-backups/
        │
        └─ (lifecycle de Cloud Storage aplica la retención — sin código, ver §5)
```

Por qué **no** se usó la alternativa "Firestore Backup Schedules"
(`gcloud firestore backups schedules create`, backups totalmente
gestionados por Google): guarda los backups en almacenamiento interno de
Firestore, no en un bucket propio, con retención fija (máx. 7 días
diarios / 14 semanas semanales) y sin la estructura de
carpetas/lifecycle/costos que pide esta entrega. La exportación a Cloud
Storage (la usada acá) es la opción oficial cuando se necesita control
sobre destino, estructura y retención.

### 2.1. Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `functions/src/backups/config.ts` | Constantes: nombre del bucket, prefijo raíz, retención objetivo por nivel (solo informativa/documental). |
| `functions/src/backups/exportFirestore.ts` | `runFirestoreExport(tier, ctx)` — la lógica real: arma el `outputUriPrefix`, llama `exportDocuments`, espera el LRO, calcula tamaño aproximado, escribe el metadata. |
| `functions/src/backups/exportFirestore.test.ts` | 6 tests unitarios (mocks de `FirestoreAdminClient` y `Storage`) — no requieren emulador porque el emulador de Firestore **no** implementa `exportDocuments`. |
| `functions/src/scheduled/backupFirestoreDaily.ts` | Wrapper `onSchedule` fino (patrón idéntico a `reconcileGuestCounters.ts`). |
| `functions/src/scheduled/backupFirestoreWeekly.ts` | Ídem, semanal. |
| `functions/src/scheduled/backupFirestoreMonthly.ts` | Ídem, mensual. |
| `scripts/gcs/firestore-backups-lifecycle.json` | Política de retención declarativa de Cloud Storage (§5). |

### 2.2. Archivos modificados

| Archivo | Cambio |
|---|---|
| `functions/src/index.ts` | Se agregaron los 3 exports (`backupFirestoreDaily/Weekly/Monthly`). |
| `.github/workflows/firestore-backup.yml` | Se agregó un comentario al inicio indicando que el sistema está en fase de transición (sin cambios de lógica). |

## 3. Cronograma (centralizado)

El cronograma vive **únicamente** en el campo `schedule` de cada
`onSchedule()` — no hay un archivo de configuración separado que se pueda
desincronizar del código real.

| Nivel | Función | Cron (UTC) | Cuándo | Archivo |
|---|---|---|---|---|
| Diario | `backupFirestoreDaily` | `0 9 * * *` | 09:00 todos los días | `functions/src/scheduled/backupFirestoreDaily.ts` |
| Semanal | `backupFirestoreWeekly` | `15 9 * * 0` | 09:15 domingos | `functions/src/scheduled/backupFirestoreWeekly.ts` |
| Mensual | `backupFirestoreMonthly` | `30 9 1 * *` | 09:30 el día 1 de cada mes | `functions/src/scheduled/backupFirestoreMonthly.ts` |

Horarios elegidos para no competir con los demás jobs de baja demanda del
proyecto: `reconcileGuestCounters` (04:00 UTC), `firestore-backup.yml` vía
GitHub Actions (08:17 UTC), `sweepReconfirmations` (13:00 UTC).

**Para cambiar un horario**: editar el `schedule` (formato cron estándar)
en el archivo correspondiente y desplegar (`firebase deploy
--only functions:backupFirestoreDaily`, etc.). Firebase actualiza el job
de Cloud Scheduler subyacente automáticamente — no hace falta tocarlo a
mano en la Console.

## 4. Estructura del bucket

```
gs://app-pases-9e6e7-firestore-backups/
└── firestore-backups/
    ├── daily/
    │   └── 2026-08-02T09-00-00-000Z/     (formato nativo de exportDocuments)
    │       ├── 2026-08-02T09-00-00-000Z.overall_export_metadata
    │       └── all_namespaces/...
    ├── weekly/
    │   └── 2026-08-02T09-15-00-000Z/
    ├── monthly/
    │   └── 2026-08-01T09-30-00-000Z/
    └── metadata/
        ├── daily/2026-08-02T09-00-00-000Z.json
        ├── weekly/2026-08-02T09-15-00-000Z.json
        └── monthly/2026-08-01T09-30-00-000Z.json
```

- El nombre de cada carpeta de backup es el timestamp ISO-8601 con `:` y
  `.` reemplazados por `-` (nombres de objeto de GCS no deben depender de
  esos caracteres para ordenarse bien en todas las herramientas) —
  ordenable lexicográficamente = ordenable cronológicamente.
- Dentro de cada carpeta de nivel (`daily/<timestamp>/...`), el contenido
  lo genera Firestore mismo (formato propietario `.overall_export_metadata`
  + archivos `.export_metadata`/`output-N` por colección) — no se toca a
  mano ni se reinterpreta; es exactamente lo que espera
  `gcloud firestore import`.
- `metadata/<tier>/<timestamp>.json` es liviano (creado por nuestro
  código, no por Firestore) y sirve para auditar corridas sin tener que
  abrir Cloud Logging: `{ tier, timestamp, outputUriPrefix, durationMs,
  approxSizeBytes, success: true }`.

## 5. Políticas de retención (Cloud Storage Lifecycle Management)

**No se borra nada desde código.** La retención la aplica Cloud Storage
de forma nativa via Object Lifecycle Management, declarada en
`scripts/gcs/firestore-backups-lifecycle.json`:

| Prefijo | Retención | Transición de clase de almacenamiento |
|---|---|---|
| `firestore-backups/daily/`, `.../metadata/daily/` | Eliminar a los 30 días | — |
| `firestore-backups/weekly/`, `.../metadata/weekly/` | Eliminar a los 84 días (12 semanas) | → Nearline a los 30 días |
| `firestore-backups/monthly/`, `.../metadata/monthly/` | Eliminar a los 365 días (12 meses) | → Nearline a los 30 días, → Coldline a los 90 días |

**Configuración pendiente en Google Cloud Console/CLI** (no ejecutado por
mí — requiere `gcloud` autenticado contra producción, no disponible en
este entorno):

```bash
gcloud storage buckets update gs://app-pases-9e6e7-firestore-backups \
  --lifecycle-file=scripts/gcs/firestore-backups-lifecycle.json
```

Verificar después con:
```bash
gcloud storage buckets describe gs://app-pases-9e6e7-firestore-backups --format="default(lifecycle_config)"
```

## 6. Convivencia con el sistema actual

Durante esta etapa **ambos sistemas corren en paralelo, sin excepción**:

- `scripts/backup-firestore.mjs`, `scripts/restore-firestore.mjs` y
  `.github/workflows/firestore-backup.yml` siguen exactamente igual que
  antes (solo se agregó un comentario informativo al workflow).
- El repo `Ericolink/paselink-backups` sigue recibiendo el backup diario
  de GitHub Actions sin cambios.
- El sistema nativo es **aditivo**: agrega un segundo mecanismo, no
  reemplaza al primero. Ver §11 para cuándo y cómo se evalúa el retiro
  del sistema clásico (no antes de validar el nuevo con datos reales).

## 7. Restauración desde un backup nativo

### 7.1. Prerrequisitos

- `gcloud` CLI instalado y autenticado con un usuario que tenga el rol
  **Cloud Datastore Import Export Admin** (`roles/datastore.importExportAdmin`)
  o superior sobre el proyecto.
- Identificar el `outputUriPrefix` exacto a restaurar — está en el
  `metadata/<tier>/<timestamp>.json` correspondiente (campo
  `outputUriPrefix`), o listando el bucket:
  ```bash
  gcloud storage ls gs://app-pases-9e6e7-firestore-backups/firestore-backups/daily/
  ```

### 7.2. Comandos

**Restauración completa** (sobrescribe documentos existentes con el
mismo path; documentos creados después del backup y no presentes en él
**no se tocan ni se borran** — un `import` es un merge, no un
reemplazo total):

```bash
gcloud firestore import \
  gs://app-pases-9e6e7-firestore-backups/firestore-backups/daily/2026-08-02T09-00-00-000Z \
  --project=app-pases-9e6e7
```

**Restauración de colecciones puntuales** (más seguro para incidentes
acotados — p. ej. recuperar solo `events` y `guests`):

```bash
gcloud firestore import \
  gs://app-pases-9e6e7-firestore-backups/firestore-backups/daily/2026-08-02T09-00-00-000Z \
  --collection-ids=events,guests \
  --project=app-pases-9e6e7
```

### 7.3. Riesgos

- **No es reversible con un solo comando.** Un `import` mal apuntado
  sobrescribe documentos reales de producción con la versión del backup —
  no hay "deshacer", solo restaurar desde un backup anterior o más
  reciente.
- **Import ≠ reemplazo total.** Si el objetivo es "volver exactamente al
  estado de tal fecha" (incluyendo que ciertos documentos dejen de
  existir porque se crearon después), un `import` **no logra eso** — solo
  sobrescribe/agrega, nunca borra. Para ese caso, evaluar restaurar a una
  base de datos secundaria nueva y comparar/migrar a mano, o usar
  `scripts/restore-firestore.mjs` (que sí puede apuntar a paths
  específicos con más control fino).
- **Firestore rechaza lecturas/escrituras normales mientras corre un
  import a gran escala** en las colecciones afectadas (posible
  degradación temporal, no downtime total) — evitar en horario de evento
  en vivo.
- Requiere el rol IAM correcto (§9) — sin él, el comando falla con
  `PERMISSION_DENIED`, no con un error ambiguo.

### 7.4. Tiempos aproximados

Para el tamaño actual de la base de datos de PaseLink (decenas de miles
de documentos, no millones), un import completo debería tardar minutos,
no horas — confirmar el tiempo real la primera vez que se ensaye (ver
checklist §12) en vez de asumir un número sin medir.

### 7.5. Buenas prácticas

- **Nunca restaurar directo contra producción como primer intento.**
  Crear una base de datos Firestore secundaria de prueba
  (`gcloud firestore databases create --database=restore-drill
  --location=us-central1 --type=firestore-native`) e importar ahí primero.
- Avisar/coordinar con quien esté operando el escáner de check-in si el
  restore es en horario de evento activo.
- Preferir `--collection-ids` sobre un import completo cuando el
  incidente es acotado.

### 7.6. Validaciones posteriores

- Contar documentos por colección restaurada y comparar contra
  `metadata/<tier>/<timestamp>.json` (el backup nativo no guarda conteos
  por colección hoy — comparar contra el manifest de
  `scripts/backup-firestore.mjs` si la fecha coincide, o contar a mano
  con la Console).
- Verificar en la app real: abrir un evento restaurado, confirmar lista
  de invitados, probar un check-in de prueba.
- Revisar Cloud Logging por errores de `permission-denied` o
  `failed-precondition` durante el import.

## 8. Monitoreo

Cada corrida pasa por `withScheduledObservability` (mismo middleware que
las demás 26 Cloud Functions — ver `docs/backend-observability.md`), así
que hereda automáticamente:

| Qué se registra | Cómo |
|---|---|
| Inicio | `withScheduledObservability` — log INFO al entrar. |
| Fin / duración | `durationMs` en el log de cierre (éxito o error). |
| Tamaño aproximado | `approxSizeBytes` — suma de `metadata.size` de todos los objetos escritos bajo el prefijo del backup, calculado después de que termina el LRO. |
| Éxito | Log INFO `"Export de Firestore completado (<tier>)"` + `metadata/<tier>/<timestamp>.json` con `success: true`. |
| Errores | Si `exportDocuments` o el LRO fallan, la excepción se propaga; `withScheduledObservability` la clasifica y loguea en `ERROR` con stack trace → **Cloud Error Reporting la ingiere automáticamente**, igual que cualquier otro bug de las Cloud Functions existentes. No se escribe un `metadata.json` de fallo — el error ya queda capturado en Cloud Logging/Error Reporting, evitar duplicar la fuente de verdad. |
| Destino usado | `outputUriPrefix` queda en el contexto de todos los logs de esa invocación (`jsonPayload.outputUriPrefix`). |

Consultas útiles en Cloud Logging
(https://console.cloud.google.com/logs/query?project=app-pases-9e6e7):

```
jsonPayload.functionName=~"^backupFirestore"
```

```
jsonPayload.functionName=~"^backupFirestore"
severity="ERROR"
```

**Límite conocido:** el `timeoutSeconds: 540` (9 min) de las 3 funciones
asume que el export completo termina dentro de ese margen — razonable
para el tamaño actual de la base. Si la base de datos crece
significativamente y el export empieza a acercarse a ese límite, subir
`timeoutSeconds` (máximo 3600s en Cloud Functions v2) en los 3 archivos
`scheduled/backupFirestore*.ts`. No se implementó polling asíncrono
aparte porque agregaría infraestructura (otra función programada
revisando LROs pendientes) que no se justifica mientras el export entre
cómodo en una sola invocación.

## 9. Seguridad e IAM

### 9.1. Principio de mínimo privilegio — quién necesita qué

Hay **dos identidades distintas** involucradas, con permisos distintos:

1. **La cuenta de servicio de runtime de las Cloud Functions** (la que
   ejecuta `backupFirestoreDaily/Weekly/Monthly`) — necesita permiso para
   *iniciar* el export y para escribir el `metadata.json`/listar tamaños.
2. **El agente de servicio de Firestore** (cuenta administrada por
   Google, `service-<PROJECT_NUMBER>@gcp-sa-firestore.iam.gserviceaccount.com`)
   — es quien *efectivamente escribe* los archivos del export en Cloud
   Storage, no la cuenta de la Cloud Function. Este es un detalle que se
   pasa por alto fácilmente: sin este permiso, `exportDocuments` falla
   con `PERMISSION_DENIED` aunque la cuenta de la función tenga todos los
   permisos de Firestore.

**Configuración pendiente en IAM** (no ejecutada por mí — requiere
`gcloud`/Console autenticados contra producción):

```bash
# 1. Obtener el número de proyecto (necesario para el paso 3)
gcloud projects describe app-pases-9e6e7 --format='value(projectNumber)'

# 2. Confirmar qué cuenta usan las Cloud Functions v2 hoy (puede ser la
#    default de App Engine o la default de Compute, según cuándo se
#    habilitó por primera vez la API — confirmar, no asumir)
gcloud functions describe checkInGuest --gen2 --region=us-central1 \
  --format='value(serviceConfig.serviceAccountEmail)'

# 3. Rol para poder llamar exportDocuments (proyecto completo — la API no
#    permite acotarlo a una sola base de datos)
gcloud projects add-iam-policy-binding app-pases-9e6e7 \
  --member="serviceAccount:<SA_DEL_PASO_2>" \
  --role="roles/datastore.importExportAdmin"

# 4. Permiso de escritura en el bucket para la cuenta de la función
#    (metadata.json + listado de tamaños)
gcloud storage buckets add-iam-policy-binding gs://app-pases-9e6e7-firestore-backups \
  --member="serviceAccount:<SA_DEL_PASO_2>" \
  --role="roles/storage.objectAdmin"

# 5. Permiso de escritura en el bucket para el agente de servicio de
#    Firestore (quien realmente escribe el export) — usar el número de
#    proyecto del paso 1
gcloud storage buckets add-iam-policy-binding gs://app-pases-9e6e7-firestore-backups \
  --member="serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-firestore.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

Contar con ~5-8 minutos de demora de propagación de IAM antes de probar
(mismo comportamiento ya documentado para el gotcha de IAM del sistema
actual, §1.5).

### 9.2. El bucket no debe ser público

Al crear el bucket (§10, comando de creación), usar **acceso uniforme a
nivel de bucket** (no ACLs por objeto) y **prevención de acceso público
forzada**:

```bash
gcloud storage buckets create gs://app-pases-9e6e7-firestore-backups \
  --project=app-pases-9e6e7 \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --public-access-prevention
```

Verificar después (no debe haber `allUsers` ni `allAuthenticatedUsers` en
la política, y `public_access_prevention` debe decir `enforced`):

```bash
gcloud storage buckets get-iam-policy gs://app-pases-9e6e7-firestore-backups
gcloud storage buckets describe gs://app-pases-9e6e7-firestore-backups --format="default(iam_configuration)"
```

### 9.3. Resumen de permisos mínimos

| Principal | Rol | Alcance | Motivo |
|---|---|---|---|
| SA de runtime de las Cloud Functions | `roles/datastore.importExportAdmin` | Proyecto | Iniciar `exportDocuments` (la API no admite un alcance más chico). |
| SA de runtime de las Cloud Functions | `roles/storage.objectAdmin` | Solo el bucket de backups | Escribir `metadata.json`, listar/leer tamaños. |
| Agente de servicio de Firestore (`service-<N>@gcp-sa-firestore...`) | `roles/storage.objectAdmin` | Solo el bucket de backups | Es quien realmente escribe el contenido del export. |
| Cualquier persona que vaya a restaurar | `roles/datastore.importExportAdmin` | Proyecto | Ejecutar `gcloud firestore import` manualmente. |

Nada de esto se le da a `allUsers`/`allAuthenticatedUsers`, ni a
cuentas fuera de este proyecto de GCP.

## 10. Costos

### 10.1. Cloud Storage

- Clase Standard en `us-central1`, mismo región que Firestore → sin costo
  de egreso entre Firestore y el bucket durante el export.
- Con 30 backups diarios + 12 semanales + 12 mensuales retenidos en
  régimen estable (~54 copias, pero el contenido de cada una escala con
  el tamaño real de la base, hoy modesto — decenas de miles de
  documentos), el costo de almacenamiento debería ubicarse en centavos a
  pocos dólares/mes a esta escala. **Confirmar con datos reales tras el
  primer mes** (§10.4) en vez de proyectar sin medir.
- Las transiciones a Nearline/Coldline (§5) reducen el costo de
  almacenamiento de los backups semanales/mensuales (~50%/~70% más
  barato que Standard) sin perder retención — el trade-off es un cargo
  mínimo por recuperación anticipada si se restaura desde ahí antes del
  período mínimo de la clase (poco probable: restaurar desde un backup
  semanal/mensual de más de 30-90 días ya es un escenario de desastre,
  no de rutina).

### 10.2. Operaciones de Firestore (exportación)

Cada `exportDocuments` se cobra como si se leyera cada documento
exportado una vez (tarifa estándar de lecturas de Firestore) — no es
gratis, y es **adicional** al costo que ya genera
`scripts/backup-firestore.mjs` (que también lee todo con el Admin SDK).
Con 3 corridas/día en los días donde coinciden diario+semanal+mensual (un
domingo que además sea día 1), eso es hasta 3 exports completos ese día
+ el backup clásico de GitHub = 4 lecturas completas de la base ese día
puntual; el resto de los días son 2 (nativo diario + clásico).

### 10.3. Operaciones de Cloud Storage y tráfico

- Operaciones de clase A (escritura) al crear los objetos del export +
  el `metadata.json` — volumen bajo, costo despreciable a esta escala.
- Sin tráfico de red saliente relevante mientras no se descarguen los
  backups fuera de GCP (una restauración normal ocurre dentro de GCP,
  sin egreso).

### 10.4. Recomendaciones para minimizar costos sin comprometer la estrategia

1. Dejar correr un mes con datos reales y revisar el desglose en
   https://console.cloud.google.com/billing/app-pases-9e6e7/reports
   filtrado por SKU de Firestore/Cloud Storage antes de ajustar nada.
2. Si el costo de exportación completa 3x/día resulta significativo,
   evaluar reducir el nivel diario a retener menos días (p. ej. 14 en vez
   de 30) antes que eliminar un nivel completo — el diario es el que da
   el RPO más ajustado.
3. Las transiciones Nearline/Coldline (§5) ya están puestas por defecto
   — no requieren mantenimiento adicional, GCS las aplica solo.
4. No agrandar el alcance del export con `collectionIds` reducido salvo
   que se confirme que hay colecciones voluminosas y prescindibles para
   DR (hoy se exporta todo — más simple, más seguro, y el costo
   adicional de incluir colecciones chicas es marginal).

## 11. Plan de transición desde el sistema de GitHub

**Fase actual (esta entrega):** ambos sistemas corren en paralelo. El
nativo es candidato a futura fuente de verdad, pero no reemplaza a nada
todavía — nadie debe asumir que el sistema de GitHub dejó de ser
necesario.

**Próxima fase (validación, antes de decidir nada):**
1. Completar la configuración pendiente de Console/CLI (§5, §9, §12).
2. Disparar manualmente las 3 funciones (Console → Cloud Scheduler →
   "Ejecutar ahora", o `gcloud scheduler jobs run`) y confirmar que
   escriben en el bucket.
3. Ensayar una restauración real a una base de datos secundaria de
   prueba (§7.5) y medir el tiempo real — hoy es una estimación, no un
   dato medido.
4. Dejar correr ambos sistemas sin intervención durante al menos 4-6
   semanas, revisando que el nativo no falle silenciosamente (Cloud
   Monitoring/Error Reporting, §8).

**Fase de reducción de frecuencia del sistema de GitHub (opcional, solo
si la validación anterior sale bien):** bajar `firestore-backup.yml` de
diario a semanal, no eliminarlo — vale la pena seguir teniendo un backup
fuera de GCP como protección ante un incidente de facturación/cuenta de
Google Cloud comprometida o suspendida (un solo proveedor como único
punto de fallo es justo el tipo de riesgo que un segundo mecanismo
independiente busca evitar).

**Fase de retiro (fuera de alcance de esta entrega, decisión futura y
explícita del usuario):** eventualmente, si el sistema nativo demuestra
ser confiable por varios meses y se prioriza simplificar, podría
desactivarse `firestore-backup.yml` y archivarse (no borrarse de
entrada) el repo `paselink-backups`. **No ejecutar esta fase sin pedido
explícito** — la restricción de "no eliminar el sistema actual" de esta
entrega sigue vigente hasta que se decida lo contrario.

## 12. Checklist de validación (configuración pendiente)

Todo lo siguiente requiere `gcloud`/Firebase CLI autenticados contra
producción — no se ejecutó nada de esto automáticamente:

- [ ] Crear el bucket (`gcloud storage buckets create ...`, §9.2).
- [ ] Aplicar el lifecycle (`gcloud storage buckets update --lifecycle-file=scripts/gcs/firestore-backups-lifecycle.json`, §5).
- [ ] Confirmar la cuenta de servicio de runtime de las Cloud Functions v2 del proyecto (§9.1, paso 2).
- [ ] Otorgar `roles/datastore.importExportAdmin` a esa cuenta (proyecto).
- [ ] Otorgar `roles/storage.objectAdmin` sobre el bucket a esa cuenta.
- [ ] Otorgar `roles/storage.objectAdmin` sobre el bucket al agente de servicio de Firestore (`service-<PROJECT_NUMBER>@gcp-sa-firestore.iam.gserviceaccount.com`).
- [ ] Verificar que el bucket no sea público (`get-iam-policy` + `iam_configuration.public_access_prevention=enforced`).
- [ ] `firebase deploy --only functions:backupFirestoreDaily,functions:backupFirestoreWeekly,functions:backupFirestoreMonthly`.
- [ ] Confirmar en Cloud Scheduler (Console) que se crearon los 3 jobs con los horarios de §3.
- [ ] Disparar `backupFirestoreDaily` manualmente y confirmar: objeto nuevo en `gs://.../firestore-backups/daily/...`, `metadata/daily/....json` con `success:true`, log de éxito en Cloud Logging.
- [ ] Simular un fallo (p. ej. revocar temporalmente el permiso del bucket) y confirmar que aparece en Cloud Error Reporting.
- [ ] Ensayar una restauración completa a una base de datos secundaria de prueba (§7.5) y medir el tiempo real.
- [ ] Actualizar §7.4 y §10.1 de este documento con los tiempos/costos reales medidos, en vez de dejar solo la estimación inicial.
