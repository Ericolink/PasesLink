# PaseLink en Blaze: auditoría de arquitectura empresarial

Fecha: 2026-07-31. Autor: revisión de arquitectura asistida, alcance completo del repositorio.

## 0. Resumen ejecutivo

PaseLink nació y creció casi por completo bajo el plan Firebase Spark (gratis). Esa restricción no fue un detalle técnico menor: moldeó decisiones de diseño en prácticamente todas las capas del producto — dónde vive la lógica de negocio, cómo se envían notificaciones, cómo se hacen los backups, cómo se gestiona el rol de administrador, y qué features se pospusieron por completo (pasarela de pago real, WhatsApp Business API).

El proyecto ya está en Blaze. La migración del módulo de lista de espera/reconfirmación (julio 2026) probó en producción el patrón que el resto del proyecto debería seguir: Cloud Functions v2 con Secret Manager, transacciones re-verificadas del lado del servidor, Cloud Scheduler en vez de cron externo. Ese módulo es la prueba de concepto — el resto de PaseLink (guests.ts, capacity.ts, concessions.ts, tres scripts de notificaciones, el manejo del rol admin, los backups) sigue operando bajo supuestos de Spark que ya no aplican.

Hallazgos más importantes, en orden de severidad real (no de facilidad de implementación):

1. **Vector de fraude de pago real**: `setGuestPaymentStatus`, `bulkSetGuestPaymentStatus` y `confirmPaymentAndCheckIn` marcan invitados como "pagado" e incrementan contadores de ingresos únicamente desde una transacción de cliente. Un cliente modificado que satisfaga las reglas puede marcar cualquier invitado como pagado sin que haya ocurrido un pago real. Esto ya era cierto en Spark, pero en Spark no había alternativa — en Blaze sí.
2. **Ya se golpeó dos veces en producción el techo de 1000 expresiones de Firestore Security Rules**, en las reglas de `events/{eventId}` y `guests/{guestId}` — las dos reglas más grandes del proyecto, exactamente donde vive la lógica de capacidad, pago y check-in. Esto no es un riesgo hipotético de escala futura: ya ocurrió con el volumen actual. Seguir agregando ramas a esas reglas (como exigiría cualquier feature nueva de pago/capacidad) acerca al proyecto a un techo de plataforma, no solo de mantenibilidad.
3. **Pipeline de notificaciones duplicado**: existen dos sistemas de envío de email haciendo esencialmente lo mismo (dedup vía `sendLog`, presupuesto diario compartido vía `sendBudget`) — uno nuevo en Cloud Functions/Secret Manager (`functions/src/reconfirm`, `functions/src/waitlist`) y uno viejo en GitHub Actions/scripts Node (`send-notifications.mjs`, `send-mass-messages.mjs`, `send-rsvp-reminders.mjs`). La migración a Blaze quedó a mitad de camino.
4. **La pasarela de pago real (Stripe/Mercado Pago) está formalmente diseñada y bloqueada solo por la ausencia de Blaze** (`PLATFORM_EXPANSION_ARCHITECTURE.md`). Esa condición ya no existe. Es la mejora de mayor impacto de negocio de todo este documento y ya tiene el modelo de datos preparado para recibirla.
5. **Deuda de integridad de datos ya materializada**: cuatro scripts de backfill (`backfill-paid-count`, `backfill-checkins-by-hour`, `backfill-rsvp-counts`, `backfill-reactions-subcollection`) existen porque contadores agregados mantenidos por `increment()` disperso en ~12 funciones de `guests.ts` se desincronizaron. No es un riesgo teórico — ya pasó, más de una vez.

Este documento detalla cada oportunidad con problema/arquitectura nueva/beneficios/complejidad/prioridad/riesgos/esfuerzo, y cierra con un roadmap de 4 fases ordenado por ROI.

## 1. Metodología y alcance

Se revisó código fuente completo (no solo nombres de archivo) de: `src/firebase/guests.ts`, `capacity.ts`, `attendeeLimit.ts`, `concessions.ts`, `waitlist.ts`, `reconfirm.ts`, `events.ts`; `firestore.rules` (1907 líneas); todo `functions/src/` (triggers, callables, scheduled, lib); todos los scripts de `scripts/*.mjs` y `scripts/lib/`; todos los workflows de `.github/workflows/`; y los documentos de arquitectura previos (`WAITLIST_RECONFIRMATION_ARCHITECTURE.md`, `CAPACITY_LIMIT_ARCHITECTURE.md`, `PLATFORM_EXPANSION_ARCHITECTURE.md`, `FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md`, `INNOVATION_FEATURES_V1.md`).

No se hicieron cambios de código en esta auditoría — es un documento de diagnóstico y plan, igual que los RFC previos del proyecto.

## 2. Contexto: qué prueba ya el módulo de lista de espera

`functions/src/` es la primera y única incursión de PaseLink en Cloud Functions v2. Vale la pena nombrar explícitamente el patrón que estableció, porque cada oportunidad de este documento propone extenderlo, no inventar uno nuevo:

- **Secretos**: `defineSecret()` de Secret Manager declarado a nivel de función (`functions/src/lib/secrets.ts`), nunca variables de entorno planas de CI. Rotable, con log de acceso propio.
- **Transacciones re-verificadas en el servidor**: cada operación que toca capacidad o dinero vuelve a leer el estado real dentro de `runTransaction`, nunca confía en un valor calculado antes de entrar.
- **Idempotencia de envíos**: doc determinístico en `sendLog/{id}` + `.create()` — si ya existe, se salta el envío. Sobrevive reintentos de Cloud Scheduler/Cloud Tasks sin duplicar.
- **Errores como vocabulario fijo**: `HttpsError` con códigos consistentes (`failed-precondition`, `resource-exhausted`, etc.), mensajes en español orientados al usuario final.
- **Separación de runtime**: `functions/` no importa nada de `src/` — mismo código Node aislado del navegador, mismo criterio que ya regía en `scripts/*.mjs`.
- **Tests contra emulador con Admin SDK**, sin mockear Firestore — 291+66+ tests nuevos entre `test:firebase` y `test:functions` a lo largo de las tres fases del módulo.

Este es el estándar de facto del proyecto. Las recomendaciones de este documento son, en esencia, "aplicar esto a `guests.ts`, `capacity.ts`, `concessions.ts` y al pipeline de notificaciones legado".

---

## 3. Backend — Cloud Functions

### 3.1 Consolidar el pipeline de notificaciones en Cloud Functions event-driven

**Problema actual.** Existen simultáneamente dos sistemas de envío de email que hacen lo mismo con infraestructura distinta:

- Legado (Spark-era, sigue en producción): `scripts/send-notifications.mjs` (push FCM), `scripts/send-mass-messages.mjs` (email masivo vía Brevo), `scripts/send-rsvp-reminders.mjs` (recordatorios diarios vía Brevo) — los tres corren como cron de GitHub Actions (`*/10 * * * *` los dos primeros, `0 13 * * *` el tercero), leen el service account de Firebase desde un secret de GitHub Actions, y el comentario en cada uno lo dice explícitamente: *"mismo patrón... firebase-admin, sin Cloud Functions, plan Spark"*.
- Nuevo (Blaze, ya en producción): `functions/src/waitlist/notify.ts`, `functions/src/reconfirm/sweep.ts`, `functions/src/scheduled/sweepReconfirmations.ts` — mismo Brevo, mismo `sendLog`, mismo `sendBudget/{fecha}` compartido, pero con Secret Manager y Cloud Scheduler.

Ambos sistemas escriben al mismo documento `sendBudget/{YYYY-MM-DD}` (el cupo de 300 emails/día es de la cuenta de Brevo, no de Firebase), así que hoy conviven sin chocar — pero el proyecto mantiene dos formas de hacer lo mismo, con dos lugares donde vive el secreto de Brevo, y la cola de push (`notificationQueue`) sigue con latencia de hasta 10 minutos porque se procesa por polling en vez de por evento.

**Nueva arquitectura.**
- Reemplazar el polling de `notificationQueue` por un **Firestore trigger** (`onDocumentCreated`) que dispara el envío push en segundos, no en hasta 10 minutos. Es el cambio de mayor impacto en experiencia de usuario de todo este documento y el de menor riesgo técnico (la lógica de envío/dedup ya existe, solo cambia el disparador).
- Migrar `send-mass-messages.mjs` y `send-rsvp-reminders.mjs` a Cloud Functions: el primero como Callable (el organizador ya dispara la creación de la campaña desde la UI — el trigger natural es `onDocumentCreated` sobre `messageCampaigns`, igual que el push) o como continuación del patrón `onSchedule` si se prefiere mantener el batch por franja horaria; el segundo directamente como `onSchedule` diario, mismo patrón exacto que `sweepReconfirmations`.
- Con eso, `scripts/lib/emailChannel.mjs`, `scripts/lib/dailyBudget.mjs` y los tres workflows de GitHub Actions correspondientes se retiran. Un solo lugar para el secreto de Brevo (Secret Manager), un solo `DAILY_BUDGET_CAP` (ver 6.4 más abajo sobre centralizarlo).

**Beneficios.** Latencia de push de "hasta 10 min" a "segundos" (UX). Un solo pipeline de notificaciones en vez de dos (mantenibilidad). Secretos rotables con log de acceso en vez de vivir en GitHub Secrets (seguridad). Elimina 3 workflows de GitHub Actions corriendo cada 10 minutos casi siempre contra una cola vacía (costo operativo marginal, aunque GitHub Actions ya es gratis para este repo — el ahorro real es de superficie de mantenimiento, no de dinero).

**Complejidad.** Media — la lógica de envío/dedup se reutiliza casi sin cambios; lo que cambia es el disparador (trigger/scheduler en vez de script standalone) y el empaquetado (mover a `functions/src/`).

**Prioridad.** Alta para el trigger de push (bajo riesgo, alto impacto UX inmediato). Media para migrar mass-messages/rsvp-reminders (funcionan hoy, la ganancia es de consolidación, no de una falla activa).

**Riesgos y migración sin downtime.** Migrar función por función, no las tres juntas. Mantener el workflow de GitHub Actions viejo desactivado pero no borrado durante 1-2 semanas después de cada migración, como red de contingencia. El presupuesto compartido (`sendBudget`) ya es compatible con ambos sistemas corriendo en paralelo momentáneamente, así que no hay riesgo de doble gasto de cupo Brevo durante la transición.

**Esfuerzo.** S (trigger de push) / M (mass-messages) / S (rsvp-reminders, ya hay un `onSchedule` gemelo para copiar).

### 3.2 Rol de administrador: de documento a custom claims

**Problema actual.** `firestore.rules:85-91` lo dice explícitamente: *"se eligió esta colección [`/admins/{uid}`] en vez de customClaims (Fase 4D) porque asignar customClaims requiere el Admin SDK, que en este proyecto solo está disponible vía Cloud Functions — y este proyecto está deliberadamente en el plan Spark, sin Blaze."* Esa razón ya no existe. Hoy `isAdmin()` hace una lectura extra de Firestore (`exists(/databases/$(database)/documents/admins/$(uid))`) en **decenas** de ramas de las reglas — incluidas las dos reglas que ya golpearon el techo de 1000 expresiones (ver 5.1).

**Nueva arquitectura.** Un trigger `onDocumentWritten` sobre `admins/{uid}` que llama a `admin.auth().setCustomUserClaims(uid, { admin: true/false })` cuando se crea/borra el documento. Las reglas pasan de `exists(/admins/$(uid))` (lectura de Firestore) a `request.auth.token.admin == true` (dato ya presente en el JWT, sin lectura adicional). El documento `admins/{uid}` puede conservarse como fuente de verdad legible/auditable desde la UI de administración, pero deja de ser lo que las reglas consultan en caliente.

**Beneficios.** Reduce el costo por-request de cada regla que chequea `isAdmin()` (menos lecturas de Firestore por evaluación de regla = más margen antes de tocar el techo de 1000 expresiones). Simplifica las reglas. Los claims viajan en el token, sin latencia de red adicional en cada verificación.

**Complejidad.** Baja-media. El único cuidado real es la propagación: un usuario con sesión activa no ve el nuevo claim hasta que refresca su ID token (`getIdToken(true)`) — hay que forzar ese refresh tras otorgar/revocar admin, o aceptar hasta 1 hora de desfase (vencimiento natural del token).

**Prioridad.** Alta — es barata, de bajo riesgo, y ataca directamente el hallazgo más urgente del documento (el techo de 1000 expresiones).

**Riesgos.** Ninguno destructivo. Migrar en paralelo: agregar el claim sin quitar todavía el chequeo por documento en las reglas (`isAdmin()` pasa a ser `token.admin == true || exists(/admins/$(uid))`), correr así una o dos semanas, confirmar que todos los admins actuales tienen el claim (backfill único, comparable a los scripts de `backfill-*` ya existentes en el repo), y recién entonces quitar la rama de `exists()`.

**Esfuerzo.** S.

### 3.3 Pasarela de pago real (Stripe / Mercado Pago)

**Problema actual.** `PLATFORM_EXPANSION_ARCHITECTURE.md` es explícito: *"Bloqueado: requiere un endpoint que reciba webhooks de forma síncrona; PaseLink es deliberadamente Spark — decisión del usuario: posponer hasta evaluar el upgrade a Blaze."* Hoy todo pago se confirma manualmente por el organizador (`setGuestPaymentStatus`), lo cual es además el vector de fraude descrito en 4.1. El modelo de datos ya está preparado para esto — la misma arquitectura documenta: *"pensado para que el día que exista una pasarela de pago real, este estado lo resuelva un webhook en segundos en vez de un organizador a mano — la máquina de estados no cambia, solo quién la dispara."*

**Nueva arquitectura.** Una HTTPS Function (`onRequest`, no `onCall` — los webhooks de Stripe/Mercado Pago no son llamadas autenticadas de un usuario de la app) que recibe el webhook, verifica la firma del proveedor, y ejecuta exactamente la misma transacción que hoy ejecuta `setGuestPaymentStatus`/`confirmPaymentAndCheckIn` pero disparada por el webhook en vez de por el clic del organizador. Esto además resuelve de raíz el hallazgo de fraude de 4.1: si el pago se confirma únicamente por Callable/webhook del lado del servidor con verificación de firma, ya no hay forma de que un cliente modificado marque "pagado" sin que haya ocurrido un cargo real.

**Beneficios.** Elimina la fricción de "avisale al organizador que ya pagaste" (conversión/UX). Cierra el vector de fraude de pago. Habilita cobro real dentro de la plataforma en vez de fuera de banda (transferencia + confirmación manual). Es, con diferencia, la mejora de mayor impacto de negocio de este documento.

**Complejidad.** Alta. Integración con proveedor de pagos, manejo de reembolsos/contracargos, conciliación, cumplimiento (PCI se delega al proveedor si se usa Checkout hospedado, pero igual hay superficie de cumplimiento).

**Prioridad.** Alta, pero **de decisión de producto, no solo técnica** — implica elegir proveedor (Stripe vs. Mercado Pago, según mercado geográfico de los organizadores), definir modelo de comisión de la plataforma si aplica, y decidir si se lanza como reemplazo total o como opción adicional al pago manual existente.

**Riesgos.** Es el cambio de mayor riesgo del roadmap por tocar dinero real de terceros. Migración sin downtime: lanzar como **opción adicional**, no reemplazo — el flujo manual (`setGuestPaymentStatus`) sigue existiendo para organizadores que cobran por transferencia/efectivo; el webhook solo añade una vía automática. Requiere ambiente de pruebas del proveedor (modo sandbox) antes de producción, y un plan de reconciliación diaria (¿cuadra lo que dice Stripe/Mercado Pago con lo que dice Firestore?).

**Esfuerzo.** XL. Es un proyecto en sí mismo, no una tarea de sprint — amerita su propio RFC de alcance (tal como ya lo anticipa `PLATFORM_EXPANSION_ARCHITECTURE.md`).

### 3.4 WhatsApp Business API

**Problema actual.** Hoy "WhatsApp" en PaseLink es un enlace `wa.me` que abre el cliente de WhatsApp del organizador con un mensaje prellenado — un humano tiene que apretar enviar. No hay integración server-side. El RFC de reconfirmación lo pospuso dos veces explícitamente: *"decisión explícita: medir uso real de la lista de espera antes de invertir... en un canal pago nuevo"* y lo llama *"la primera dependencia paga recurrente que adopta el proyecto."*

**Nueva arquitectura.** Cloud Function que llama a la API de WhatsApp Business (Meta) para reconfirmaciones/recordatorios/ofertas de lista de espera, con plantillas pre-aprobadas por Meta. Requiere verificación de negocio en Meta, número dedicado, y aprobación de plantillas — trabajo de configuración, no solo de código.

**Beneficios.** Tasa de apertura/respuesta de WhatsApp es sustancialmente mayor que email para este tipo de recordatorio, en la experiencia típica de productos de eventos en Latinoamérica (mercado principal de PaseLink por el copy en español).

**Complejidad.** Media (técnicamente) + Alta (configuración/aprobación externa con Meta, fuera del control del equipo).

**Prioridad.** Media. El razonamiento original del usuario para posponerlo — medir uso real antes de sumar un costo recurrente — sigue siendo válido incluso en Blaze; Blaze resolvió el bloqueador *técnico* (ya se paga Cloud Functions), no el argumento de *producto* (¿hay evidencia de que WhatsApp mueva la aguja lo suficiente para justificar el costo y la fricción de aprobación de Meta?). Recomendación: no priorizar por delante de 3.1-3.3, pero dejar de tratarlo como "bloqueado técnicamente" — es una decisión de producto pendiente, no una imposibilidad de plataforma.

**Riesgos.** Aprobación de plantillas por Meta puede tardar días/semanas y no está bajo control del equipo — no meter esto en el camino crítico de ningún otro entregable.

**Esfuerzo.** M-L (dominado por la parte de configuración con Meta, no por el código de PaseLink).

---

## 4. Integridad de datos: lógica crítica que hoy vive en el cliente

Este es el bloque de mayor severidad real del documento. `guests.ts` (72KB, el archivo más grande del proyecto), `capacity.ts` y `concessions.ts` ejecutan `runTransaction` **desde el navegador** para decisiones que hoy dependen enteramente de la buena fe del cliente, con `firestore.rules` actuando solo como una verificación de forma/magnitud, nunca de corrección de negocio.

### 4.1 Confirmación de pago y check-in → Callable Functions

**Problema actual.** Tres funciones son el corazón del riesgo:

- `setGuestPaymentStatus` / `bulkSetGuestPaymentStatus` (`guests.ts`): el organizador aprieta "marcar como pagado" y el cliente escribe `paymentStatus: 'paid'` + incrementa `paidCount` en una transacción propia. No hay ninguna prueba server-side de que un pago haya ocurrido.
- `confirmPaymentAndCheckIn` (`guests.ts`): el botón "Sí, ya pagó" del escáner funde aprobación de pago + check-in físico en la misma transacción de cliente — el mayor valor combinado (dinero + entrada física) del sistema, completamente orquestado por el navegador.
- `checkInGuest` (`guests.ts`): la condición `requiresPayment && paymentStatus !== 'paid'` que bloquea el check-in de invitados que no pagaron es lógica de cliente; las reglas solo controlan qué *campos* puede tocar una escritura con permiso `scanQr`, nunca vuelven a evaluar esa condición.

Por diseño, `firestore.rules` no puede verificar "¿ocurrió realmente un pago?" — solo puede verificar la forma de la escritura. Esto ya era así en Spark; la diferencia es que en Spark no había forma de resolverlo del todo (no había Admin SDK disponible desde ningún backend propio). En Blaze sí.

**Nueva arquitectura.** Migrar estas tres operaciones a Callable Functions con Admin SDK, siguiendo exactamente el patrón ya probado por `confirmWaitlistOffer`/`promoteWaitlistEntry`: la función vuelve a leer el estado real dentro de una transacción del lado del servidor, aplica la regla de negocio (¿el invitado está en un estado válido para pasar a pagado/check-in?), y solo entonces escribe. El cliente deja de escribir estos campos directamente — las reglas de Firestore para `paymentStatus`/`checkedIn*`/`paidCount` pasan de "permitir si la forma del delta es razonable" a "denegar toda escritura de cliente, solo el Admin SDK puede tocarlos" (mismo patrón que ya usa `sendBudget`: `allow read, write: if false`).

Esto resuelve dos problemas a la vez: cierra el vector de fraude, y **alivia directamente el techo de 1000 expresiones** de las reglas de `events/{eventId}` y `guests/{guestId}` (5.1), porque esas ramas de reglas — las más complejas de todo el archivo — dejan de existir; se reemplazan por un `allow write: if false` mucho más simple, y la complejidad de negocio se mueve a TypeScript, donde es más fácil de testear, versionar y razonar.

**Beneficios.** Seguridad (cierra fraude de pago). Escalabilidad de las reglas (menos expresiones por evaluación, más margen antes del techo). Mantenibilidad (la lógica de negocio deja de estar duplicada entre TypeScript de cliente, TypeScript de reglas-helpers y el DSL de reglas). Consistencia con el patrón ya validado del módulo de lista de espera.

**Complejidad.** Alta — es la porción más grande y más usada del código del producto (check-in en vivo, el momento de mayor tráfico de un evento). Requiere reescribir y volver a testear extensivamente el camino más crítico de la app.

**Prioridad.** Crítica desde la óptica de seguridad/integridad de datos; sin embargo, por su tamaño y su cercanía a la operación en vivo de eventos reales, se recomienda secuenciar con cuidado (ver riesgos).

**Riesgos y migración sin downtime.**
- No migrar las tres funciones a la vez. Orden sugerido: primero `setGuestPaymentStatus`/`bulkSetGuestPaymentStatus` (menor superficie, no toca el escáner en vivo), después `confirmPaymentAndCheckIn` y `checkInGuest` juntos (comparten la misma condición de negocio).
- El escáner QR es la pieza más sensible a latencia — una Callable Function agrega una llamada de red que antes era una transacción local. Mitigarlo con `minInstances` (ver 8.3) para evitar cold starts justo en el momento de mayor tráfico de un evento (la puerta, al inicio).
- Probar exhaustivamente con el emulador (mismo patrón que ya usa `test:functions`) antes de tocar producción, y hacer rollout gradual por feature flag si el volumen de eventos activos lo justifica.
- Mantener compatibilidad de datos: el esquema de `guests` no cambia, solo quién tiene permiso de escribir esos campos — la migración no requiere backfill de datos existentes.

**Esfuerzo.** L-XL.

### 4.2 Capacidad y alta de invitados → Callable Functions

**Problema actual.** La lógica de "¿entra este invitado dentro del cupo?" está implementada **tres veces de forma independiente**: `addGuest`, `addGuestsBulk` (chunks de 50, un `runTransaction` por chunk) y `addGuestsFromRows` (importación CSV) reimplementan cada una su propio algoritmo de "leer capacidad restante, decidir cuántos entran, escribir." Además, `registerWalkInGuest` (`capacity.ts`) es la transacción más expuesta de todo el proyecto: corre sin autenticación, para tráfico público de internet, y el propio comentario del código admite que la validación de longitud por campo de `customData` hecha en el bucle del cliente es *"la única barrera real"* porque las reglas de Firestore no pueden iterar valores de un mapa para verificar longitudes individuales.

**Nueva arquitectura.** Una sola Callable Function (o un pequeño conjunto: alta individual, alta masiva, auto-registro público) que centraliza el algoritmo de "cabe/no cabe" una única vez, reemplazando las tres implementaciones client-side. Para `registerWalkInGuest` en particular, mover a Callable cierra el gap real de validación (longitud de campos arbitrarios) que hoy las reglas no pueden cubrir, sin depender de que el cliente sea honesto.

**Beneficios.** Una sola fuente de verdad para "cómo se calcula si un invitado entra" en vez de tres. Cierra el gap de validación de longitud de campos en el registro público. Reduce further la superficie de las reglas de `events/{eventId}` (mismo beneficio de 4.1 sobre el techo de expresiones).

**Complejidad.** Media-alta. La importación masiva (CSV, cientos de filas) además se beneficia de dejar de bloquear al cliente en un loop de transacciones — candidato natural para Cloud Tasks (ver 8.2).

**Prioridad.** Alta para `registerWalkInGuest` (es tráfico público no autenticado, la superficie de mayor exposición). Media para consolidar las tres rutas de alta con capacidad, dado que hoy funcionan, aunque tripliquen lógica.

**Riesgos.** Bajo — a diferencia de 4.1, esto no toca el flujo en vivo de check-in en la puerta, sino el flujo de configuración previo al evento. Migración incremental función por función es segura.

**Esfuerzo.** M (por función migrada) / L en conjunto.

### 4.3 Concesiones (comida/bebida): checkout → Callable Function

**Problema actual.** `createConcessionOrder` decrementa stock y crea la orden en una transacción de cliente. El propio comentario de las reglas lo admite: *"rules validan solo forma, nunca que `subtotalMinorUnits`/`totalMinorUnits` coincidan con el precio real del catálogo"* — un cliente que satisfaga la forma podría fabricar totales inconsistentes con el catálogo real mientras la contabilidad de stock sigue siendo correcta.

**Nueva arquitectura.** Callable Function que recalcula precios/stock desde el catálogo real del lado del servidor antes de confirmar la orden, mismo patrón que 4.1/4.2.

**Beneficios.** Cierra el único gap de integridad de precio reconocido explícitamente en el propio código de reglas.

**Complejidad.** Media. `concessions.ts` es un módulo más nuevo y más acotado que `guests.ts`.

**Prioridad.** Media — el módulo de concesiones es reciente (fase piloto, no GA todavía según `FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md`), así que el radio de impacto de un exploit hoy es menor que en pagos de entrada, pero conviene resolverlo antes de la salida a GA.

**Riesgos.** Bajo, dado el alcance acotado (todavía en beta).

**Esfuerzo.** M.

### 4.4 Reconciliación de contadores agregados vía trigger

**Problema actual.** Contadores como `peopleCount`, `paidCount`, `checkedInCount`, `occupancyCount`, `rsvpYesCount/NoCount/PendingCount` se mantienen con `increment()` disperso en ~12 funciones distintas de `guests.ts`. La evidencia de que esto ya produce drift en producción son los **cuatro scripts de backfill que existen hoy**: `backfill-paid-count.mjs`, `backfill-checkins-by-hour.mjs`, `backfill-rsvp-counts.mjs` y `backfill-reactions-subcollection.mjs` — cada uno documentado como una corrección retroactiva porque algún camino de escritura no mantuvo el contador correctamente desde el principio, o porque se agregó un contador nuevo y los documentos viejos quedaron desactualizados.

**Nueva arquitectura.** Un Firestore trigger (`onDocumentWritten` sobre `guests/{guestId}`) que recalcula los contadores agregados del evento cada vez que cambia un invitado, en vez de confiar en que cada uno de los ~12 sitios de escritura del cliente incremente correctamente el contador correcto. Alternativa más liviana para el caso de solo-lectura: usar las agregaciones nativas `count()`/`sum()` de Firestore (consulta server-side de bajo costo) para pantallas de reporte que no necesitan el contador persistido en tiempo real, reservando `increment()` únicamente para lo que sí necesita lectura instantánea (p. ej. el contador de ocupación en vivo del escáner).

**Beneficios.** Elimina la necesidad de futuros scripts de backfill — la fuente de verdad se recalcula sola en vez de depender de que cada nuevo camino de escritura recuerde incrementar el contador correcto. Reduce drift silencioso.

**Complejidad.** Media. El riesgo principal es de costo/latencia si el trigger recalcula sobre *toda* la subcolección de invitados en cada escritura en vez de aplicar un delta incremental — para eventos grandes conviene mantener el delta incremental (como hoy) pero agregar el trigger como **reconciliador periódico de respaldo**, no como reemplazo total del incremento en caliente.

**Prioridad.** Media-alta — no es una vulnerabilidad de seguridad como 4.1, pero es deuda técnica que ya causó incidentes reales (los 4 backfills) y seguirá causándolos con cada contador nuevo que se agregue.

**Riesgos.** Bajo si se implementa como reconciliador (corre aparte, corrige diferencias) en vez de como único mecanismo (reemplazar `increment()` por completo agregaría latencia al camino de escritura). Recomendación: mantener `increment()` para la escritura en caliente y agregar un job periódico (Cloud Scheduler, diario o cada pocas horas) que recalcule y corrija drift — mismo espíritu que los backfills actuales, pero automático y recurrente en vez de manual y reactivo.

**Esfuerzo.** M.

---

## 5. Seguridad y Security Rules

### 5.1 El techo de 1000 expresiones — ya ocurrió, dos veces

**Problema actual.** Las reglas de `events/{eventId}` (`allow update`, ~180 líneas, 8+ ramas OR) y `guests/{guestId}` (`allow update`, ~140 líneas, 9+ ramas OR) tienen comentarios propios que documentan haber **excedido en producción** el límite de Firestore de 1000 expresiones evaluadas por request — una vez por el registro público de auto-registro, otra por la rama combinada de check-in+pago. Esto no es un riesgo de escala futura hipotética: ya pasó con el volumen actual del proyecto, y cada feature nueva que agregue una rama a estas dos reglas empuja más cerca de repetirlo.

**Nueva arquitectura.** La solución estructural es la misma que ya recorre este documento: mover la lógica de negocio de estas dos reglas a Callable Functions (4.1, 4.2), lo que permite reemplazar ramas complejas de reglas por `allow write: if false` (el Admin SDK bypassea las reglas por completo, así que la validación deja de vivir ahí). Como paso intermedio de menor esfuerzo, custom claims para admin (3.2) también reduce el costo de evaluación de cada rama que hoy hace `exists(/admins/$(uid))`.

**Beneficios.** Elimina el riesgo de un tercer incidente de este tipo, justo cuando el proyecto planea agregar más features de pago/capacidad.

**Complejidad.** Ver 4.1/4.2/3.2 — esta sección es el "por qué" que justifica priorizar esas tres por delante de otras de similar esfuerzo.

**Prioridad.** Crítica — es el único hallazgo de este documento con evidencia directa de haber roto producción.

**Riesgos.** Ninguno adicional a los ya descritos en 4.1/4.2/3.2.

**Esfuerzo.** Ver secciones referidas.

### 5.2 `lockToken` / concurrencia optimista real

**Problema actual.** El mecanismo de `lockTokens[]` que identifica dispositivos reconocidos de un invitado no es un lock optimista real: las reglas solo verifican que el token entrante *esté en* la lista reconocida, nunca que coincida con lo que el cliente leyó por última vez. Dos dispositivos del mismo invitado pueden escribir campos superpuestos sin que ninguno se entere del conflicto — gana el último en escribir, silenciosamente.

**Nueva arquitectura.** No es prioritario resolverlo con infraestructura nueva de Blaze — es principalmente un problema de diseño de concurrencia que podría resolverse con un campo de versión (`updatedAt`/`version`) verificado en la transacción, sin requerir Cloud Functions. Se incluye acá porque, si 4.1 migra las escrituras de invitados a Callable Functions, ese es el momento natural de agregar detección de conflicto real (el servidor puede comparar versiones antes de aplicar el cambio) casi sin costo adicional.

**Beneficios.** Evita pérdida silenciosa de ediciones cuando un invitado usa dos dispositivos.

**Complejidad.** Baja si se hace en conjunto con 4.1; media si se hace de forma aislada en las reglas actuales.

**Prioridad.** Baja — es un caso de borde (dos dispositivos del mismo invitado editando a la vez), no un riesgo de seguridad ni de escala.

**Riesgos.** Ninguno relevante.

**Esfuerzo.** S (si se hace junto con 4.1) / M (si se hace por separado).

---

## 6. Automatización

### 6.1 Backups gestionados de Firestore

**Problema actual.** `scripts/backup-firestore.mjs` exporta cada colección a JSON a mano, serializa timestamps con un formato propio, y lo commitea a un repositorio privado de GitHub (`paselink-backups`) vía cron diario. El propio código documenta la razón original: *"no requiere Blaze... lo que requiere Blaze es Cloud Storage/Scheduler/Functions, no esto."* Esa restricción ya no aplica. Riesgos concretos de este enfoque hoy:
- **Lista de colecciones hardcodeada** (`TOP_LEVEL_COLLECTIONS`/`SUBCOLLECTION_GROUPS`): cualquier colección nueva que se agregue al proyecto (p. ej. `waitlist`, agregada en esta misma sesión de features) queda **silenciosamente excluida** del backup si no se actualiza la lista a mano.
- **PII en texto plano para siempre en el historial de git** (email/teléfono de invitados en `guestContacts`): borrar un invitado en producción no purga sus datos de commits de backup anteriores.
- **Restauración lenta y manual**: lectura completa + deserialización + `batch.commit()` en chunks de 450, sin paralelismo — razonable para "recuperar un evento borrado por error", no para un desastre real de base de datos completa.

**Nueva arquitectura.** `gcloud firestore export` (o el equivalente vía Admin SDK/API) a un bucket de Cloud Storage, disparado por Cloud Scheduler, con una política de retención/lifecycle del bucket (p. ej. conservar 30 días de exports diarios, purgar automáticamente lo más viejo). Esto respalda la base completa sin enumeración manual de colecciones, restaura a velocidad nativa (`gcloud firestore import`), y no deja PII permanentemente en un historial de git.

**Beneficios.** Elimina el riesgo de colecciones nuevas excluidas silenciosamente. Restauración más rápida y confiable en un desastre real. Resuelve la retención de PII de forma más defendible (lifecycle policy con expiración automática, en vez de "vive para siempre en git").

**Complejidad.** Baja — es configuración de infraestructura (bucket + Cloud Scheduler + permiso IAM de export), no lógica nueva.

**Prioridad.** Media-alta. No es una vulnerabilidad activa, pero es el tipo de brecha que solo se nota el día que hace falta restaurar algo y el backup no tiene lo que se necesita.

**Riesgos.** Ninguno si se corre en paralelo al backup actual durante una transición (no reemplazar de golpe — correr ambos sistemas 2-4 semanas, comparar, y recién entonces retirar el pipeline de git). El repositorio `paselink-backups` existente puede conservarse como archivo histórico sin necesidad de borrarlo.

**Esfuerzo.** S.

### 6.2 Barrido de pedidos de concesiones abandonados → Cloud Scheduler

**Problema actual.** `FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md` deja explícitamente abierta esta decisión: hoy no hay barrido automático de pedidos de comida/bebida abandonados (el usuario eliminó a propósito el sistema de holds/cronómetro), pero el propio documento anticipa: *"si en producción se ve que esto genera fricción operativa real, la Fase 3 puede automatizarlo con el mismo cron de GitHub Actions que ya usa el proyecto."*

**Nueva arquitectura.** En vez de un nuevo workflow de GitHub Actions (la opción que contemplaba el RFC original, escrito antes de la migración a Blaze), usar directamente `onSchedule` de Cloud Functions — mismo patrón exacto que `sweepReconfirmations`, ya probado en producción.

**Beneficios.** Evita crear un cuarto workflow de cron externo cuando ya existe el patrón nativo probado dentro del propio proyecto.

**Complejidad.** Baja — es prácticamente copiar `sweepReconfirmations` con la condición de "abandonado" de concesiones.

**Prioridad.** Baja — condicionada, como dice el propio RFC, a evidencia real de fricción operativa. No implementar preventivamente sin esa señal.

**Riesgos.** Ninguno.

**Esfuerzo.** S, cuando/si se decide construirlo.

### 6.3 Uptime checks nativos

**Problema actual.** `uptime-check.yml` corre cada 10 minutos vía GitHub Actions, con el propio workflow reconociendo su límite: *"no es un reemplazo de un servicio dedicado de uptime... GitHub a veces atrasa los cron jobs varios minutos en momentos de mucha carga."*

**Nueva arquitectura.** Cloud Monitoring Uptime Checks (parte de Google Cloud, disponible con Blaze) ofrece chequeos desde múltiples regiones, sin la variabilidad de scheduling de un cron de CI, con políticas de alerta nativas (puede integrarse con el mismo canal de Discord vía webhook, o con Slack/PagerDuty si el proyecto crece).

**Beneficios.** Más confiable que un cron de CI para esta función específica; multi-región por defecto.

**Complejidad.** Baja.

**Prioridad.** Baja — el sistema actual funciona y ya tiene su propia mitigación documentada (usa el resultado del run anterior para no repetir avisos). No es urgente, es una mejora de robustez marginal.

**Riesgos.** Ninguno; se recomienda correr ambos en paralelo si se adopta, no reemplazar de inmediato.

**Esfuerzo.** S.

### 6.4 Centralizar el presupuesto diario de envío (`DAILY_BUDGET_CAP`)

**Problema actual.** El valor `300` (cupo diario de la cuenta de Brevo) está hardcodeado de forma independiente en al menos tres lugares: `scripts/lib/dailyBudget.mjs`, `functions/src/waitlist/notify.ts` y `functions/src/reconfirm/sweep.ts`. Es un valor de negocio (el plan contratado de Brevo), no una constante técnica, y hoy hay que recordar actualizarlo en los tres lugares si cambia el plan.

**Nueva arquitectura.** Un único punto de configuración (puede ser tan simple como una variable de entorno/parámetro de Cloud Functions, o un documento de configuración en Firestore) que todos los consumidores lean, en vez de una constante duplicada por archivo. Se resuelve solo, además, si 3.1 consolida los tres scripts legado dentro de `functions/`.

**Beneficios.** Un solo lugar para ajustar el cupo cuando cambie el plan de Brevo.

**Complejidad.** Baja.

**Prioridad.** Baja — es higiene de código, no un riesgo activo.

**Riesgos.** Ninguno.

**Esfuerzo.** XS.

---

## 7. Costos — modelo estimado

Estas son estimaciones de orden de magnitud, no una cotización — dependen del volumen real de eventos activos. El objetivo es dar una noción de escala, no un número final. Se recomienda configurar alertas de presupuesto en Google Cloud (ver 9) desde el primer despliegue nuevo, en vez de calcular esto una sola vez y olvidarlo.

| Componente | Capa gratuita | Costo aproximado a escala actual (decenas de eventos activos) | Costo aproximado en el escenario de 50k eventos / millones de invitados |
|---|---|---|---|
| Cloud Functions v2 (invocaciones) | 2M invocaciones/mes | Dentro de la capa gratuita, ~$0 | Del orden de decenas de USD/mes si se sostienen miles de invocaciones/minuto en picos (check-in, notificaciones) |
| Cloud Functions v2 (cómputo GB-seg/CPU-seg) | 400,000 GB-seg y 200,000 CPU-seg/mes | ~$0 | Depende fuertemente de `minInstances` (ver 8.3) — mantener instancias calientes para el escáner en eventos grandes tiene un costo fijo pequeño pero no nulo, del orden de unos pocos USD/mes por función con `minInstances: 1` |
| Secret Manager | 6 versiones de secreto activas gratis | $0 | Negligible — el proyecto usa 2 secretos |
| Cloud Scheduler | 3 jobs gratis/mes | $0 (el proyecto usa menos de 3 jobs) | ~$0.10/job/mes por encima de 3 — negligible |
| Cloud Firestore export a GCS (backups) | — | Centavos de USD/mes (almacenamiento Nearline/Coldline de pocos GB) | Escala linealmente con el tamaño de la base — para una base de decenas de GB, sigue siendo del orden de unos pocos USD/mes |
| Cloud Tasks (si se adopta, 8.2) | 1M operaciones gratis/mes | $0 | $0.40 por millón de operaciones por encima de la capa gratuita — negligible salvo importaciones masivas muy frecuentes |
| Cloud Monitoring / alertas | Capa gratuita amplia para métricas y alertas estándar | $0 | $0 en el uso típico; costo solo si se retienen logs/métricas custom por mucho tiempo o a volumen muy alto |
| Pasarela de pago (Stripe/Mercado Pago) | — | No aplica hoy (no implementado) | Comisión por transacción del proveedor (típicamente ~3-4% + fijo por operación) — este es el único costo de este documento que escala directamente con el éxito del negocio, no con la infraestructura |

**Lectura general**: ninguna de las mejoras de las secciones 3-6 tiene un costo mensual significativo a la escala actual ni siquiera en el escenario de gran escala planteado — Cloud Functions, Secret Manager, Cloud Scheduler y Firestore export están todos diseñados para este tipo de carga y sus capas gratuitas son generosas. El único costo realmente variable y no despreciable es la comisión de la pasarela de pago, que es proporcional al volumen de dinero procesado, no un costo de infraestructura.

---

## 8. Escalabilidad — 50.000 eventos, millones de invitados, miles de check-ins simultáneos

### 8.1 Contadores shardeados en documentos calientes

**Problema actual.** Es el hallazgo de escalabilidad más importante del documento, y no es una hipótesis nueva de este análisis — **está documentado de forma independiente en los tres RFCs de arquitectura del proyecto** (`CAPACITY_LIMIT_ARCHITECTURE.md`, `WAITLIST_RECONFIRMATION_ARCHITECTURE.md`, `FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md`) como "techo conocido, no construido". Firestore tiene un límite práctico de ~1 escritura sostenida por segundo por documento. Los contadores de capacidad/ocupación/stock viven todos en un único documento (`events/{eventId}` o `concessionsCatalog/{itemId}`), incrementado por cada check-in, cada compra, cada alta de invitado. Con miles de check-ins simultáneos en la puerta de un evento grande, ese único documento se convierte en el cuello de botella de todo el sistema.

**Nueva arquitectura.** Contador shardeado (patrón estándar de Firestore): en vez de un campo `checkedInCount` en un solo documento, distribuir el contador en N sub-documentos (`events/{eventId}/counterShards/{0..N}`), cada escritura incrementa un shard aleatorio, y la lectura del total suma todos los shards (o se cachea con una Cloud Function que recalcula el agregado periódicamente para lecturas de baja latencia).

**Beneficios.** Elimina el cuello de botella de escritura en el escenario de miles de check-ins simultáneos — es literalmente el único cambio de este documento que resuelve ese escenario específico.

**Complejidad.** Alta — no es solo agregar shards; requiere decidir cómo se leen totales de forma eficiente (agregación en cada lectura vs. caché recalculado), y tocar todos los sitios que hoy leen/escriben esos contadores.

**Prioridad.** Baja hoy, **crítica en el momento en que exista evidencia real de contención** (los tres RFCs coinciden en este criterio: no construir preventivamente sin evidencia). Es el ítem más claro de "Fase 4" de todo este documento.

**Riesgos.** Construirlo antes de tiempo agrega complejidad real (lecturas más caras, más superficie de bugs) a cambio de un beneficio que no se necesita todavía. El riesgo de *no* construirlo a tiempo es un evento grande con check-in degradado o fallido en la puerta — por eso el gate de "evidencia real de contención" debe monitorearse activamente (ver 9), no solo documentarse y olvidarse.

**Esfuerzo.** L, cuando se decida construirlo.

### 8.2 Cola de tareas (Cloud Tasks) para importaciones masivas

**Problema actual.** `addGuestsBulk`/`addGuestsFromRows` procesan la importación (CSV, cientos de filas) en el propio cliente, en un loop de transacciones de a 50 invitados, bloqueando la pestaña del organizador hasta terminar.

**Nueva arquitectura.** Una Callable Function que encola la importación completa en Cloud Tasks, procesa en background, y notifica al organizador (vía la misma cola de notificaciones de 3.1) cuando termina. El organizador deja de tener que mantener la pestaña abierta durante una importación grande, y el procesamiento se vuelve resumible ante un fallo parcial.

**Beneficios.** Importaciones masivas dejan de bloquear al usuario. Resiliencia ante fallos parciales (Cloud Tasks reintenta automáticamente).

**Complejidad.** Media-alta — depende de haber resuelto primero 4.2 (la lógica de "cabe/no cabe" ya centralizada en el servidor).

**Prioridad.** Baja hoy (las importaciones típicas son de cientos de filas, no de decenas de miles), pero se vuelve relevante en el escenario de millones de invitados donde una importación de un evento corporativo grande podría ser de miles de filas.

**Riesgos.** Bajo, es aditivo — no reemplaza el flujo actual para importaciones chicas, solo agrega una vía asíncrona para las grandes.

**Esfuerzo.** M-L.

### 8.3 Tuning de Cloud Functions v2

**Problema actual.** Ninguna función declarada hoy configura región, memoria, CPU, `minInstances`/`maxInstances` o concurrencia — todo corre con los valores por defecto del framework. Esto es razonable al volumen actual (una sola feature en producción), pero no está preparado para el escenario de escala.

**Nueva arquitectura.**
- **Región**: fijar explícitamente la misma región que la base de Firestore, para evitar latencia cross-region innecesaria (hoy corre en el default, probablemente ya coincide, pero no está garantizado por configuración explícita).
- **`minInstances`**: para funciones en el camino crítico de check-in (una vez migradas, ver 4.1), mantener al menos una instancia caliente durante ventanas de eventos activos evita cold starts justo en el momento de mayor tráfico (la puerta, al inicio del evento) — el momento donde una latencia extra de 1-2 segundos por cold start es más visible y más costosa en experiencia.
- **`maxInstances`**: poner un techo explícito por función evita que un pico de tráfico inesperado (o un bug que cause loops de reintento) genere una factura sorpresa — es tanto control de costo como protección operativa.
- **Concurrencia**: Cloud Functions v2 permite múltiples requests por instancia; para funciones livianas (no atadas a CPU) subir la concurrencia por instancia reduce el número de instancias necesarias para el mismo tráfico, bajando costo.

**Beneficios.** Mejor latencia percibida en el momento de mayor tráfico real (la puerta del evento). Costo más predecible y acotado.

**Complejidad.** Baja — es configuración, no lógica nueva.

**Prioridad.** Media, y se vuelve alta en el mismo momento en que 4.1 migre el check-in a Callable Functions (deberían ir de la mano, no como un paso separado posterior).

**Riesgos.** Ninguno significativo; `minInstances` tiene un costo fijo pequeño pero no nulo (ver tabla de costos), vale la pena limitarlo a las funciones que realmente lo necesitan.

**Esfuerzo.** S.

### 8.4 Rate limiting en endpoints públicos no autenticados

**Problema actual.** `registerWalkInGuest` (autoregistro público) y el checkout de concesiones son transacciones alcanzables sin autenticación. App Check ya está parcialmente adoptado (Enforce pendiente de revisión según memoria de trabajo previa), pero a la escala de millones de invitados con tráfico público, conviene una capa adicional de protección contra abuso (scraping, spam de registros, ataques de fuerza bruta sobre tokens de invitación).

**Nueva arquitectura.** Completar la puesta en Enforce de App Check (trabajo ya en curso según contexto del proyecto) + considerar Cloud Armor o rate limiting a nivel de Cloud Functions (ya disponible como configuración nativa v2) para los endpoints públicos de mayor exposición.

**Beneficios.** Protección adicional contra abuso a gran escala, más allá de lo que las reglas de Firestore pueden ofrecer por sí solas.

**Complejidad.** Media.

**Prioridad.** Media — la escala de tráfico público real hoy no lo exige con urgencia, pero es el tipo de control que conviene tener antes de que haga falta, no después de un incidente de abuso.

**Riesgos.** Ninguno si se implementa con márgenes generosos (el objetivo es frenar abuso claro, no afectar tráfico legítimo).

**Esfuerzo.** M.

---

## 9. Observabilidad

El frontend ya tiene Sentry (Fase 1 de observabilidad, según trabajo previo del proyecto). El backend nuevo en Cloud Functions no tiene una capa equivalente propia todavía — hoy depende de los logs por defecto de Cloud Logging sin estructura ni alertas configuradas.

Recomendaciones concretas, todas de bajo esfuerzo relativo porque Blaze las habilita de forma nativa sin infraestructura adicional:

- **Logging estructurado** en las Cloud Functions (usar el logger de `firebase-functions/logger` con campos estructurados — eventId, guestId, tipo de operación — en vez de `console.log` plano) para que los logs sean consultables/filtrables en Cloud Logging, no solo texto.
- **Error Reporting**: automático para excepciones no capturadas en Cloud Functions v2 sin configuración adicional — solo hace falta revisarlo activamente (agregarlo al mismo canal de alertas de Discord que ya usa el proyecto para uptime, o a Sentry si se prefiere una sola herramienta).
- **Cloud Monitoring — alertas de negocio, no solo de infraestructura**: una política de alerta sobre tasa de error de las Callable Functions críticas (una vez migrado 4.1), y sobre el `sendBudget` diario acercándose al cupo de Brevo (para saber que se están por dejar de enviar emails antes de que empiece a pasar silenciosamente).
- **Alertas de presupuesto de Google Cloud**: configurar desde el primer despliegue de cualquier función nueva de este roadmap, con umbrales conservadores — es la forma más simple de evitar sorpresas de costo mientras se valida el modelo de la sección 7 contra el uso real.
- **Métrica de contención de documentos calientes**: si se pospone 8.1 (contadores shardeados) hasta tener evidencia real, esa evidencia debería venir de monitorear activamente la tasa de contención/reintentos de transacción en los documentos de capacidad — sin esa métrica, "esperar evidencia" corre el riesgo de convertirse en "enterarse en el peor momento posible" (un evento grande en vivo).

**Prioridad.** Alta — es barato, no tiene riesgo, y es lo que permite validar (o corregir) el resto de las estimaciones de este documento con datos reales en vez de suposiciones.

**Esfuerzo.** S-M en conjunto.

---

## 10. DevOps

- **Ambientes**: hoy hay preview channels de Hosting por PR (`firebase-hosting-pull-request.yml`), pero no hay un ambiente equivalente para Cloud Functions/reglas — todo cambio de backend se prueba contra el emulador local y va directo a producción. Considerar un proyecto Firebase de staging (mismo patrón que ya usa `demo-paselink-test` para tests, pero persistente y desplegable) para validar cambios de Functions/reglas antes de producción, especialmente a medida que 4.1-4.3 aumenten la superficie de Cloud Functions en el camino crítico.
- **Secretos**: consolidar en Secret Manager (ya el estándar para `functions/`) y retirar progresivamente los secretos que hoy viven como GitHub Secrets planos una vez migrados los scripts correspondientes (3.1, 6.1).
- **CI/CD**: el pipeline actual (`tests.yml`, `test:firebase` contra emulador) ya cubre reglas de Firestore; falta un job equivalente de `test:functions` obligatorio en CI para cualquier PR que toque `functions/` (verificar si ya está incluido — si no, es una adición de bajo esfuerzo y alto valor antes de que crezca la superficie de Cloud Functions).
- **Testing**: el patrón ya establecido (emulador + Admin SDK directo, sin mockear Firestore) es sólido y debería mantenerse como estándar para todo el código nuevo de este roadmap — no introducir mocks de Firestore en ningún test nuevo.

**Prioridad.** Media — no bloquea ninguna otra mejora de este documento, pero conviene resolverlo en paralelo a 4.1 (el ambiente de staging es más valioso cuanto más riesgoso es lo que se despliega).

**Esfuerzo.** M.

---

## 11. Qué NO cambiar

No todo lo que se diseñó bajo restricciones de Spark es hoy una decisión equivocada. Vale la pena decirlo explícitamente para que este documento no se lea como "reescribir todo":

- **`capacity.ts` — `walkIn`/`walkOut` simples**: siguen siendo razonables como transacción de cliente para el caso de uso actual (ajuste manual de ocupación por el organizador, no un flujo de alto volumen). No requieren Callable Function salvo que se decida endurecer todo el módulo de capacidad de una vez junto con 4.1/4.2.
- **`onSnapshot` para actualizaciones en tiempo real de UI** (p. ej. notificar al Menu Manager de concesiones): es la herramienta correcta incluso en Blaze — no todo tiempo real necesita convertirse en una notificación server-side.
- **El razonamiento de "no construir el contador shardeado sin evidencia de contención"** (8.1) sigue siendo correcto — Blaze no cambia el principio de no construir infraestructura compleja para un problema que todavía no existe, solo cambia el costo de construirlo *cuando* haga falta.
- **El diseño de reconfirmación 100% manual (sin ventana de gracia automática)** fue una decisión de producto explícita, no una limitación técnica de Spark — no hay razón para revisitarla por el solo hecho de estar en Blaze.

---

## 12. Roadmap por fases, ordenado por ROI

**Fase 1 — Alto impacto, bajo riesgo (semanas 1-4).** Cambios acotados, reversibles, sin tocar el camino crítico de check-in en vivo.

1. Trigger de Firestore para notificaciones push (3.1, parcial) — de hasta 10 min de latencia a segundos. **S.**
2. Custom claims para rol de administrador (3.2) — alivia directamente el techo de expresiones de reglas. **S.**
3. Backups gestionados a GCS en paralelo al backup actual (6.1). **S.**
4. Observabilidad backend: logging estructurado + Error Reporting + alertas de presupuesto (9). **S-M.**
5. Centralizar `DAILY_BUDGET_CAP` (6.4). **XS.**

**Fase 2 — Migraciones importantes (meses 1-3).** El grueso del trabajo de integridad de datos y seguridad; requiere testing extensivo pero no rediseño de producto.

6. Migrar `setGuestPaymentStatus`/`bulkSetGuestPaymentStatus` a Callable Function (4.1, primera mitad). **L.**
7. Migrar `confirmPaymentAndCheckIn`/`checkInGuest` a Callable Function + tuning de `minInstances` (4.1 segunda mitad + 8.3). **L.**
8. Migrar `registerWalkInGuest` a Callable Function (4.2, prioridad sobre las otras dos por ser tráfico público). **M.**
9. Consolidar `send-mass-messages.mjs`/`send-rsvp-reminders.mjs` en Cloud Functions (3.1, resto). **M.**
10. Trigger de reconciliación de contadores agregados (4.4). **M.**
11. Ambiente de staging para Functions/reglas (10). **M.**

**Fase 3 — Optimizaciones (meses 3-6).**

12. Consolidar alta de invitados con capacidad (`addGuest`/`addGuestsBulk`/`addGuestsFromRows`) en una sola implementación server-side (4.2, resto). **L.**
13. Checkout de concesiones a Callable Function (4.3). **M.**
14. Uptime checks nativos de Cloud Monitoring en paralelo al workflow actual (6.3). **S.**
15. Evaluar WhatsApp Business API como piloto acotado, si hay evidencia de que vale el costo (3.4). **M-L.**
16. Detección de conflicto real en `lockToken` (5.2), aprovechando la migración de 4.1. **S.**

**Fase 4 — Arquitectura de gran escala (a demanda, quando haya evidencia real de necesidad).**

17. Pasarela de pago real — Stripe/Mercado Pago (3.3). Es la mejora de mayor impacto de negocio del documento, pero se ubica en Fase 4 por su tamaño (XL) y porque requiere su propio proceso de decisión de producto (elección de proveedor, modelo de comisión) antes de empezar a construir — recomendación: **iniciar esa decisión de producto en paralelo a la Fase 1**, para que el trabajo técnico pueda arrancar en Fase 2-3 si la decisión de negocio ya está tomada, en vez de esperar a que termine todo lo demás.
18. Contadores shardeados en documentos calientes (8.1), condicionado a evidencia real de contención monitoreada desde la Fase 1.
19. Cola de tareas (Cloud Tasks) para importaciones masivas (8.2), condicionado a evidencia de importaciones grandes reales.
20. Rate limiting/Cloud Armor en endpoints públicos a escala de abuso real (8.4).

**Nota sobre la pasarela de pago**: se la ubica en Fase 4 por tamaño de esfuerzo, no por prioridad de negocio — es, con diferencia, el ítem de mayor ROI de negocio de todo este documento (habilita cobro real dentro de la plataforma) y bien podría justificar adelantarse en el calendario si el usuario decide que es la prioridad estratégica del próximo trimestre, independientemente del orden técnico sugerido acá.
