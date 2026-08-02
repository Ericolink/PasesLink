# Consolidación del sistema de notificaciones

Fecha: 2026-08-02. Autor: revisión de arquitectura asistida, alcance: todo
envío de notificaciones del proyecto (Cloud Functions, GitHub Actions,
scripts, cliente).

**Estado:** Diagnóstico y plan original. Fases 1-4 ya implementadas en
código (mismo día) — ver banner al final de la sección 4. Cada fase se
completó con su propio banner de implementación siguiendo la misma
convención que `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` y
`WAITLIST_RECONFIRMATION_ARCHITECTURE.md`.

## Banner de implementación — Fases 1-4 (2026-08-02, mismo día)

Los tres pipelines Spark-era (push, recordatorios de RSVP, mensajería
masiva) y EmailJS (bienvenida, pase, aviso de reporte) ya migraron a Cloud
Functions + Secret Manager. Diferencias concretas respecto al plan
original:

- **Fase 0 no se hizo como paso separado**: en vez de reorganizar
  `emailChannel.ts`/`dailyBudget.ts`/`secrets.ts` en un subdirectorio
  `notifications/` antes de migrar nada, cada archivo nuevo
  (`pushChannel.ts`, `renderPlainTextEmailHtml.ts`, `guestPassEmail.ts`)
  se agregó plano en `functions/src/lib/` o `functions/src/capacity/`,
  siguiendo la convención ya existente del repo. Ningún archivo que ya
  funcionaba se movió sin necesidad.
- **Bienvenida**: un único trigger `onDocumentCreated('users/{uid}')`
  (`functions/src/triggers/onUserCreated.ts`) cubre tanto
  registro por email como Google la primera vez — `onDocumentCreated` solo
  dispara la primera vez que existe el documento, reproduciendo gratis el
  chequeo manual `isNewUser` que antes hacía el cliente.
- **Pase por email**: no se usó un trigger de Firestore — se integró
  directamente en el callable `registerWalkInGuest`
  (`functions/src/capacity/guestPassEmail.ts`), llamado después de que la
  transacción ya comprometió. Es más simple que un trigger separado (ya
  tiene todos los datos a mano: email, nombre del evento, qrToken) y evita
  tener que distinguir "es un walk-in con email" en un trigger genérico de
  `guests/`.
- **Aviso de reporte**: trigger `onDocumentCreated('reports/{reportId}')`
  (`functions/src/triggers/onReportCreated.ts`), tal como estaba previsto.
  `REPORT_ADMIN_EMAIL` se agregó a Secret Manager (`lib/secrets.ts`) en vez
  de quedar como `VITE_REPORT_ADMIN_EMAIL` — ya no es una variable de build
  del cliente.
- **Limpieza adicional no prevista en el RFC original**: al retirar
  EmailJS también quedó huérfano el pub/sub `emailNotifications.ts` (solo
  lo alimentaba `emailjs.ts`) y el componente `GlobalToastHost.tsx` (su
  único suscriptor) — ambos se borraron por ser código muerto directo de
  este cambio, no un refactor aparte.

## Banner de implementación — Fase 5 (2026-08-02, mismo día)

Auditoría de secretos reales (vía `gh secret list` y Secret Manager, antes
de tocar nada) reveló un hallazgo que no estaba en el plan original:
**`BREVO_API_KEY`/`BREVO_SENDER_EMAIL` nunca existieron como secrets de
GitHub Actions** — solo en Secret Manager (usados por Cloud Functions
desde la migración de lista de espera). Los tres workflows Spark-era de
respaldo (`mass-messages.yml`, `rsvp-reminders.yml`) referencian esos
nombres en su `env:`, pero nunca tuvieron el secret real detrás — el envío
por Brevo desde GitHub Actions nunca funcionó, ni siquiera antes de esta
migración (`scripts/lib/emailChannel.mjs` fallaba limpio por falta de
credenciales). No había nada que retirar ahí.

Acciones tomadas, con confirmación explícita del usuario antes de
ejecutar (secretos de repo compartido + Secret Manager de producción):
- Borrados de GitHub Actions secrets: `VITE_EMAILJS_SERVICE_ID`,
  `VITE_EMAILJS_TEMPLATE_ID_WELCOME`, `VITE_EMAILJS_TEMPLATE_ID_PASS`,
  `VITE_EMAILJS_PUBLIC_KEY` — confirmados huérfanos (ningún workflow los
  referencia tras la Fase 4).
- Creado en Secret Manager: `REPORT_ADMIN_EMAIL` (mismo valor que antes
  tenía `VITE_REPORT_ADMIN_EMAIL`), necesario para que
  `onReportCreated` funcione una vez desplegado.
- **Sin tocar** (a propósito): `FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7`
  sigue en uso por los 3 workflows de respaldo manual
  (`workflow_dispatch`) de las Fases 1-3 — se retira recién en la Fase 6,
  junto con los workflows enteros.

**Pendiente:** Fase 6 (borrar los 3 scripts/workflows Spark-era ya
desactivados, y `FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7` con ellos).
Responsabilidad del usuario: `firebase deploy --only
functions,firestore:rules` para que las Fases 1-4 lleguen a producción
(nada de esto se desplegó todavía).

## Fase 6 — pospuesta a propósito, con seguimiento en GitHub Issues

La Fase 6 (borrar los scripts/workflows de respaldo) todavía **no se
ejecutó**: hacerlo ahora habría anulado la ventana de rollback de 1-2
semanas post-deploy que este mismo documento exige (§4, Fase 6), ya que
ninguna de las Fases 1-5 se desplegó todavía a producción. Se creó
[issue #297](https://github.com/Ericolink/PasesLink/issues/297) con el
checklist completo (qué borrar) y la precondición explícita (deploy +
1-2 semanas de observación estable) para retomarlo en el momento
correcto, en vez de hacerlo ahora o depender de la memoria de la sesión.

## 0. Resumen ejecutivo

PaseLink pasó de Firebase Spark a Blaze el 2026-07-31/08-01. Antes de ese
cambio, ninguna notificación podía enviarse desde Cloud Functions (el plan
gratis no las permite), así que todo el envío server-side se resolvió con
scripts Node standalone disparados por cron de GitHub Actions. La migración
del módulo de lista de espera/reconfirmación (agosto 2026) ya probó en
producción el patrón correcto para Blaze — Cloud Functions v2, Secret
Manager, Cloud Scheduler — pero esa migración cubrió solo esas dos features.
El resto del sistema de notificaciones quedó a mitad de camino, y además
existe un cuarto pipeline, más viejo todavía, que ninguna auditoría previa
había cubierto: EmailJS, corriendo directamente en el navegador.

Hoy conviven **tres pipelines de envío que hacen esencialmente lo mismo**
(construir un mensaje, mandarlo, registrar el resultado) con tres
infraestructuras distintas:

1. **EmailJS**, client-side, para bienvenida/pase/aviso de reporte. El plan
   gratis tiene un techo de 2 plantillas y ya está al límite (ver
   `project_emailjs_template_swap` en la memoria del proyecto — el aviso de
   check-in ya se sacrificó por esta razón). Las credenciales viven en el
   bundle del navegador por diseño de EmailJS (clave "pública"), pero eso
   también significa que el proyecto depende de un proveedor externo desde
   el cliente para una función core (onboarding).
2. **Scripts Node + GitHub Actions cron**, para push (FCM), mensajería
   masiva y recordatorios de RSVP, todos vía Brevo o FCM. Heredado de la
   era Spark, con el propio código documentando la razón: *"firebase-admin,
   sin Cloud Functions, plan Spark"*.
3. **Cloud Functions + Secret Manager**, para ofertas de lista de espera y
   reconfirmación, también vía Brevo. Es el patrón correcto y ya está en
   producción — la base sobre la que se propone consolidar todo lo demás.

El plan de este documento retira los pipelines 1 y 2 por completo,
migrando su funcionalidad al patrón del pipeline 3, sin cambiar el
comportamiento visible para el usuario y sin tiempo de inactividad.

## 1. Metodología y alcance

Se leyó el código fuente completo (no solo nombres de archivo) de:
`src/utils/emailjs.ts` y sus 3 call sites (`src/firebase/auth.ts`,
`src/pages/EventJoin.tsx`, `src/components/ReportModal.tsx`); los 14
archivos de `scripts/` y `scripts/lib/`; los 9 workflows de
`.github/workflows/`; todo `functions/src/` (39 archivos entre `lib/`,
`callable/`, `waitlist/`, `reconfirm/`, `scheduled/`, `triggers/`); la CSP y
config de secrets en `firebase.json` y `firebase-hosting-merge.yml`; y
`BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` §3.1 (que ya señaló el problema del
lado de Brevo/scripts el 2026-07-31, sin cubrir EmailJS ni llegar a un plan
de fases accionable — este documento lo reemplaza y lo completa en lo que
respecta a notificaciones).

Quedan **fuera de alcance** deliberadamente: `uptime-check.yml` (alerta de
caída del sitio) y la alerta de deploy fallido de GitHub Actions (Fase 4 de
alertas del proyecto) — ambas son alertas operativas de infraestructura
hacia el equipo, no notificaciones hacia usuarios finales, y ya están en
transición documentada hacia Cloud Monitoring/Terraform
(`infra/terraform/README.md`). `firestore-backup.yml` tampoco es
notificación. La sección 8 explica por qué no se tocan.

## 2. Inventario completo

| Origen | Tipo de notificación | Destinatarios | Proveedor | Disparador actual | Decisión |
|---|---|---|---|---|---|
| `src/utils/emailjs.ts` → `sendWelcomeEmail` | Bienvenida al crear cuenta | Usuario nuevo | EmailJS (client-side) | Llamada directa en `src/firebase/auth.ts:56,86` (registro y login con Google) | Migrar a Cloud Functions |
| `src/utils/emailjs.ts` → `sendGuestPassEmail` | Envío del pase (link+QR) por email | Invitado que se autoregistra y deja su email | EmailJS (client-side) | Llamada directa en `src/pages/EventJoin.tsx:248` | Migrar a Cloud Functions |
| `src/utils/emailjs.ts` → `sendReportNotificationEmail` | Aviso de reporte de contenido del muro | Admin (`VITE_REPORT_ADMIN_EMAIL`) | EmailJS (client-side) | Llamada directa en `src/components/ReportModal.tsx:86`, tras guardar el reporte en Firestore | Migrar a Cloud Functions |
| `scripts/send-notifications.mjs` + `scripts/lib/pushChannel.mjs` | Push (pago confirmado, RSVP nuevo, evento actualizado) | Organizador/coanfitrión con push activo | FCM | Poll cada 10 min sobre `notificationQueue` (cron `*/10 * * * *`, `send-notifications.yml`) | Migrar a trigger de Firestore |
| `scripts/send-mass-messages.mjs` + `scripts/lib/emailChannel.mjs` | Mensajería masiva a invitados elegidos | Invitados seleccionados por el organizador en `MassMessageComposer` | Brevo REST | Poll cada 10 min sobre `messageCampaigns` (cron `*/10 * * * *`, `mass-messages.yml`) | Migrar a trigger de Firestore |
| `scripts/send-rsvp-reminders.mjs` | Recordatorio de RSVP pendiente | Invitados con `rsvpStatus: pending` en eventos con `remindersEnabled` | Brevo REST | Cron diario `0 13 * * *` (`rsvp-reminders.yml`) | Migrar a `onSchedule` |
| `functions/src/waitlist/notify.ts`, `callable/promoteWaitlistEntry.ts`, `callable/cancelWaitlistOffer.ts`, `triggers/onCapacityFreed.ts` | Oferta de lugar en lista de espera | Invitado en lista de espera | Brevo REST vía `functions/src/lib/emailChannel.ts` | Trigger de Firestore / callable | **Ya correcto** — sin cambios funcionales, es la base del módulo compartido (§3) |
| `functions/src/reconfirm/sweep.ts`, `scheduled/sweepReconfirmations.ts` | Campaña y recordatorio de reconfirmación | Invitados confirmados, según reglas de la campaña | Brevo REST vía `functions/src/lib/emailChannel.ts` | `onSchedule` diario | **Ya correcto** — sin cambios funcionales |
| `.github/workflows/uptime-check.yml` | Caída/recuperación del sitio | Discord (equipo, no usuarios) | Discord webhook | Cron cada 10 min | Fuera de alcance (§8) |
| Alerta de deploy fallido (Fase 4 de alertas) | Fallo de CI/deploy | Discord (equipo) | Discord webhook | GitHub Actions, on failure | Fuera de alcance — es CI/CD |
| `.github/workflows/firestore-backup.yml` | Backup de Firestore | — | — | Cron diario | Fuera de alcance — no es notificación |

**Duplicación de código confirmada** (mismo contrato, mantenido a mano en
dos lugares):

- `scripts/lib/emailChannel.mjs` ≡ `functions/src/lib/emailChannel.ts` —
  idénticos salvo tipado.
- `scripts/lib/dailyBudget.mjs` ≡ `functions/src/lib/dailyBudget.ts` —
  mismo contrato, portado a mano; el comentario de cabecera de la versión
  de `functions/` ya dice explícitamente que ambos siguen escribiendo al
  mismo documento `sendBudget/{fecha}` a propósito.
- El cupo diario de Brevo (`300`) está hardcodeado de forma independiente
  en `scripts/lib/dailyBudget.mjs`, `scripts/send-mass-messages.mjs` y
  `functions/src/waitlist/notify.ts`/`reconfirm/sweep.ts` — un cambio de
  plan de Brevo obliga a tocar varios archivos.

**Secretos involucrados hoy:**

| Secreto | Dónde vive hoy | Quién lo usa |
|---|---|---|
| `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID_{WELCOME,PASS,REPORT}`, `VITE_EMAILJS_PUBLIC_KEY`, `VITE_REPORT_ADMIN_EMAIL` | GitHub Actions secrets → inyectados como `VITE_*` en el build → **quedan en el bundle del navegador** (`.env`, `.env.example`, `firebase-hosting-merge.yml`) | `src/utils/emailjs.ts` |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | GitHub Actions secrets (usados por los 3 workflows Spark-era) **y** Secret Manager (`defineSecret`, usado por Cloud Functions) — duplicado en dos sistemas | `scripts/lib/emailChannel.mjs` / `functions/src/lib/emailChannel.ts` |
| `FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7` | GitHub Actions secret | Los 3 scripts, para autenticar `firebase-admin` fuera de Cloud Functions (innecesario una vez migrados — Cloud Functions no necesita credenciales explícitas) |

El `VITE_EMAILJS_PUBLIC_KEY` es "público" por diseño de EmailJS (así
funciona su SDK de navegador), pero `SERVICE_ID` y los `TEMPLATE_ID` también
terminan expuestos en el bundle sin necesidad — no son secretos de servidor
hoy, pero tampoco deberían tener que estarlo: retirar EmailJS los vuelve
irrelevantes por completo.

## 3. Arquitectura propuesta

Un único módulo compartido, `functions/src/lib/notifications/`, construido
extendiendo (no reescribiendo) lo que ya existe y funciona en producción:

- **`channels/email.ts`** — hoy `functions/src/lib/emailChannel.ts` movido
  sin cambios de contrato. Sigue siendo Brevo (no hay razón de negocio para
  cambiar de proveedor en esta consolidación — ver §8 sobre EmailJS vs.
  Brevo para las plantillas que hoy usan EmailJS).
- **`channels/push.ts`** — hoy `scripts/lib/pushChannel.mjs`, portado a
  TypeScript con el mismo contrato `{ok, error?, invalidTokens?}`.
- **`secrets.ts`** — hoy `functions/src/lib/secrets.ts`, sin cambios.
- **`dailyBudget.ts`** — hoy `functions/src/lib/dailyBudget.ts`, con el cap
  de Brevo (`300`) movido a una única constante exportada en vez de
  repetirse en cada caller.
- **`sendLog.ts`** — nueva extracción del patrón ya usado inline en
  `waitlist/notify.ts`/`reconfirm/sweep.ts` (doc determinístico +
  `.create()` para idempotencia ante reintentos de Cloud Scheduler): hoy
  cada función reimplementa el mismo `try { logRef.create(...) } catch {
  return }`. Vale la pena extraerlo una vez que haya 5+ callers (push,
  masivos, recordatorios, bienvenida, pase) en vez de las 2 actuales.

Puntos de extensión para crecer sin duplicar (objetivo 6 del pedido
original): cada función de negocio (trigger, callable u `onSchedule`)
sigue eligiendo qué canal(es) usar según el tipo de evento — el módulo no
impone un router genérico nuevo, sigue el mismo patrón ya validado en
`scripts/send-notifications.mjs` (`channels: ['push']`, con `'email'` y
`'whatsapp'` ya contemplados en el tipo `NotificationType` pero sin
implementar). Agregar WhatsApp Business API (ya diseñado en
`WAITLIST_RECONFIRMATION_ARCHITECTURE.md` §10 como canal primario futuro
para ofertas de lista de espera), SMS o un webhook genérico es agregar un
archivo nuevo en `channels/`, no tocar los existentes.

## 4. Plan de migración por fases

Cada fase es deployable y revertible por separado. Regla general de
rollback: **el workflow de GitHub Actions viejo se desactiva
(`workflow_dispatch` únicamente, sin `schedule`) pero no se borra hasta 1-2
semanas después de confirmar que la Cloud Function equivalente funciona en
producción.** El documento `sendBudget/{fecha}` ya es compatible con ambos
sistemas corriendo en paralelo momentáneamente (mismo contrato, mismo
contador), así que no hay riesgo de doble gasto de cupo Brevo durante la
transición.

**Fase 0 — Unificar utilidades duplicadas.**
Crear `functions/src/lib/notifications/` con `channels/email.ts` (mover
`emailChannel.ts`), `dailyBudget.ts` (mover, con el cap centralizado) y
`secrets.ts` (mover). Actualizar imports en `waitlist/`, `reconfirm/`,
`triggers/`, `callable/`. Sin cambio de comportamiento — puramente
reorganización, cubierta por los tests existentes. Riesgo: bajo. Esfuerzo: S.

**Fase 1 — Push: de polling a evento.**
Nueva Cloud Function `onDocumentCreated('events/{eventId}/notificationQueue/{id}')`
que reemplaza el `main()` de `send-notifications.mjs`, reutilizando
`channels/push.ts` de la Fase 0. Retira `send-notifications.yml` (tras
período de contingencia). Beneficio inmediato de UX: latencia de "hasta 10
min" a segundos. Riesgo: bajo (la lógica de envío/dedup no cambia, solo el
disparador). Esfuerzo: S.

**Fase 2 — Recordatorios de RSVP: mismo cron, Cloud Scheduler.**
Nueva Cloud Function `onSchedule({schedule: '0 13 * * *', timeZone: 'UTC'}, ...)`
que reemplaza `send-rsvp-reminders.mjs`, calcando el patrón exacto de
`scheduled/sweepReconfirmations.ts` (mismo cron, mismo `secrets:
[brevoApiKey, brevoSenderEmail]`). Retira `rsvp-reminders.yml`. Riesgo:
bajo — es un port directo de un script ya simple a un patrón ya probado.
Esfuerzo: S.

**Fase 3 — Mensajería masiva: de polling a evento.**
Nueva Cloud Function `onDocumentCreated('events/{eventId}/messageCampaigns/{id}')`
que reemplaza `send-mass-messages.mjs`. Mejora real (no solo
consolidación): de hasta 10 minutos a segundos para que el organizador vea
la campaña procesada. Retira `mass-messages.yml`. Riesgo: bajo-medio (más
lógica que push: budget compartido, `sendLog` por invitado) — probar en
emulador con una campaña grande antes de desplegar. Esfuerzo: M.

**Fase 4 — Retirar EmailJS.**
Tres nuevas Cloud Functions usando `channels/email.ts` (Brevo) en vez de
EmailJS:
- Bienvenida: trigger sobre la escritura del doc de usuario nuevo (o
  callable invocado desde `auth.ts` en vez de `sendWelcomeEmail` directo —
  a decidir en la fase de implementación cuál disparador es más fiel al
  comportamiento actual, que dispara tanto en registro por email como en
  login con Google).
- Pase por email: callable que reemplaza la llamada directa en
  `EventJoin.tsx:248`, o trigger sobre la escritura del invitado con
  `email` presente y `rsvpStatus` recién confirmado.
- Aviso de reporte: trigger sobre la creación del doc en la colección de
  reportes (el reporte ya se guarda en Firestore antes de la llamada a
  EmailJS hoy — el trigger es un cambio natural, no un rediseño).

Una vez desplegadas y verificadas: quitar `@emailjs/browser` de
`package.json`, borrar `src/utils/emailjs.ts` y sus 3 call sites, quitar
`VITE_EMAILJS_*`/`VITE_REPORT_ADMIN_EMAIL` de `.env`, `.env.example` y
`firebase-hosting-merge.yml`, y quitar `https://api.emailjs.com` de
`connect-src` en la CSP de `firebase.json`. Esta es la fase de mayor
superficie (toca cliente, no solo backend) — probar manualmente los tres
flujos (registro, autoregistro con email, reporte de contenido) contra el
emulador antes de desplegar. Riesgo: medio. Esfuerzo: M.

**Fase 5 — Secretos.**
Con las Fases 1-4 completas, ningún workflow de GitHub Actions necesita ya
`BREVO_API_KEY`, `BREVO_SENDER_EMAIL` ni `FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7`.
Retirarlos de GitHub Actions secrets (`gh secret delete BREVO_API_KEY`,
etc. — paso manual del usuario, no automatizable desde acá sin permisos de
administración del repo). `VITE_EMAILJS_*` también se retiran de GitHub
Actions secrets en este punto. Verificar que ninguna Cloud Function nueva
declare secrets fuera de `secrets: [...]` de `defineSecret` (checklist en
§5). Riesgo: bajo si se hace después de confirmar que nada los usa.
Esfuerzo: S.

**Fase 6 — Limpieza final.**
Borrar `scripts/send-notifications.mjs`, `scripts/send-mass-messages.mjs`,
`scripts/send-rsvp-reminders.mjs`, `scripts/lib/emailChannel.mjs`,
`scripts/lib/dailyBudget.mjs`, `scripts/lib/pushChannel.mjs`,
`scripts/lib/renderPlainTextEmailHtml.mjs` (esta última se mueve a
`functions/src/lib/` si sigue haciendo falta para el HTML de mensajería
masiva) y los 3 workflows YAML correspondientes. Actualizar este documento
con el banner de "implementado". Esfuerzo: S.

## 5. Seguridad

Checklist a verificar al cerrar cada fase:

- [ ] Ninguna Cloud Function nueva lee un secreto de `process.env` sin
      declararlo en `secrets: [...]` (patrón ya establecido en
      `functions/src/lib/secrets.ts`).
- [ ] Tras la Fase 4: `grep -r VITE_EMAILJS` en `src/` y `.env*` no devuelve
      resultados.
- [ ] Tras la Fase 4: `api.emailjs.com` ya no aparece en la CSP de
      `firebase.json`.
- [ ] Tras la Fase 5: `gh secret list` en el repo no incluye
      `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7`
      ni ningún `VITE_EMAILJS_*`.
- [ ] Cada Cloud Function que envía notificaciones sigue el patrón de
      idempotencia de `sendLog` (ninguna reintroduce el riesgo de reenvío
      duplicado ante reintentos de Cloud Scheduler/Firestore).
- [ ] `firestore.rules` de las colecciones de cola (`notificationQueue`,
      `messageCampaigns`) sigue sin permitir `update`/`delete` desde el
      cliente tras mover el consumidor a Cloud Functions (mismo criterio
      que ya aplica hoy, documentado en `messageCampaigns.ts`).

## 6. Pruebas

Extender los tests de emulador ya existentes en `functions/src/__tests__`
y los `*.test.ts` junto a cada función (patrón ya establecido en
`waitlist/notify.test.ts`, `reconfirm/sweep.test.ts`):

- Fase 1-3: test de emulador que crea el doc disparador
  (`notificationQueue`/`messageCampaigns`) y verifica que el trigger
  procese, actualice `status` y escriba `sendLog`, incluyendo el caso de
  reintento (doc ya `processing`/`sent` no se reprocesa).
- Fase 2: test de `onSchedule` igual al patrón ya usado para
  `sweepReconfirmations.test.ts`.
- Fase 4: test de cada nueva función de email (bienvenida, pase, reporte)
  con Brevo mockeado (mismo mock ya usado en los tests de `waitlist`), más
  una verificación manual end-to-end contra el emulador de los 3 flujos de
  usuario antes de desplegar a producción (registro, autoregistro con
  email, reporte de contenido).
- Regresión: correr `npm run test:firebase` y `npm run test:functions`
  completos después de cada fase, no solo los tests nuevos — varias
  funciones ya existentes comparten `sendBudget`/`sendLog`.

## 7. Riesgos y estrategia de rollback

| Riesgo | Mitigación |
|---|---|
| Una Cloud Function nueva falla silenciosamente y deja de enviar notificaciones que antes sí llegaban | Desplegar fase por fase, no las seis juntas; mantener el workflow de GitHub Actions viejo desactivado (no borrado) 1-2 semanas por fase como red de contingencia reactivable con un solo commit |
| Doble envío durante la transición (workflow viejo y Cloud Function nueva corriendo a la vez) | `sendLog` con `.create()` ya es idempotente entre ambos sistemas — un envío ya registrado por uno bloquea al otro, sin cambios adicionales |
| Doble gasto del cupo diario de Brevo (300/día) durante la transición | Ambos sistemas ya escriben al mismo `sendBudget/{fecha}` — confirmado por lectura de código, no es una mitigación nueva |
| Fase 4 (EmailJS) rompe el flujo de bienvenida/autoregistro, que es núcleo de onboarding | Probar los 3 flujos completos contra el emulador antes de desplegar; desplegar bienvenida/pase/reporte como tres sub-fases independientes, no juntas |
| Se borra un secreto de GitHub Actions todavía en uso por error | Fase 5 va después de confirmar en producción que las Fases 1-4 funcionan, con margen de al menos una semana de observación |

## 8. Qué se descarta migrar, y por qué

- **`uptime-check.yml`** y la **alerta de deploy fallido**: son alertas
  operativas hacia el equipo (Discord), no notificaciones hacia usuarios
  finales del producto. El propio `uptime-check.yml` ya documenta que está
  en transición hacia Cloud Monitoring/Terraform por una razón distinta
  (mejor fiabilidad que un cron de GitHub Actions) — no tiene sentido
  migrarlo dos veces con justificaciones distintas. Siguen siendo
  GitHub Actions legítimas per el objetivo 3 del pedido original ("CI/CD,
  pruebas, lint, compilación, despliegue, automatización del repositorio").
- **`firestore-backup.yml`**: no envía notificaciones, es un job de backup.

## 9. Oportunidades adicionales de simplificación

- **Cupo diario de Brevo centralizado**: hoy `300` está hardcodeado en al
  menos 3 lugares (§2). La Fase 0 lo resuelve como efecto colateral al
  unificar `dailyBudget.ts`.
- **`renderPlainTextEmailHtml.mjs`** es la única utilidad de
  `scripts/lib/` sin equivalente ya portado a `functions/src/lib/` —
  vale la pena decidir en la Fase 3 si se mueve tal cual o si conviene
  evaluar una librería de plantillas mínima ahora que va a vivir junto al
  resto del módulo de notificaciones (fuera de alcance decidirlo en este
  documento; queda anotado para la implementación).
- **`NotificationType`** (`functions/src/lib/notifications.ts`) ya declara
  `'email'` y `'whatsapp'` como canales posibles en `channels` sin
  implementación — la Fase 1 no necesita ampliarlos, pero deja el punto de
  extensión visible para cuando se implemente WhatsApp (ya diseñado en
  `WAITLIST_RECONFIRMATION_ARCHITECTURE.md` §10).
