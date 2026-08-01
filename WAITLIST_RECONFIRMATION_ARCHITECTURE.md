# RFC: Lista de espera + Reconfirmación de asistencia

**Estado:** Diseño original (Spark) — ver banners de implementación abajo. **Tanto la lista de espera (V1) como la reconfirmación (V2) ya están implementadas**, con una arquitectura distinta a la descrita en este documento (Blaze, no Spark) y con varias decisiones de producto distintas a lo recomendado acá. El documento se conserva completo como registro histórico del diseño y la crítica de producto que lo motivó — el contenido de negocio (por qué el "lugar reservado 24h" es correcto, los casos borde) sigue vigente en general; el contenido de **arquitectura técnica** y algunas decisiones puntuales de producto están superados por lo que describen los banners.
**Autor:** Diseño asistido (Claude) a pedido del admin de PaseLink, actuando como Lead Product Designer / Staff Engineer / Arquitecto.
**Fecha:** 2026-07-31.
**Depende de:** `CAPACITY_LIMIT_ARCHITECTURE.md` (implementado, sin commitear/deployar aún — ver `project_attendee_limit_v1`). Sin ese límite duro activo, no existe ningún camino que lleve a alguien a una lista de espera.

---

## Banner de implementación (2026-07-31, mismo día — el proyecto pasó a Blaze durante esta sesión)

Se implementó **solo la Lista de espera** (FIFO + prioridad manual + oferta de 24h + notificación por email). **Reconfirmación y WhatsApp Business API no se construyeron** — decisión explícita: medir uso real de la lista de espera antes de invertir en la pieza más discutida del RFC (§1, §8) y en un canal pago nuevo (§10). Todo lo que este documento describe sobre reconfirmación/WhatsApp sigue siendo el diseño a retomar en V2, sin cambios.

La arquitectura técnica cambió de raíz respecto a lo escrito más abajo porque el proyecto pasó de Firebase Spark a **Blaze** en medio de esta sesión, eliminando la restricción que motivaba "todo con transacciones de cliente + cron de GitHub Actions". Diferencias concretas con el resto de este documento:

| Este documento (Spark) | Lo que se implementó (Blaze) |
|---|---|
| Cascada de oferta: best-effort de cliente en cada función que libera un lugar + barrido de `sweep-waitlist.mjs` cada 10 min como red de seguridad (§6) | Un único **Cloud Function `onCapacityFreed`** (`onDocumentUpdated` sobre `events/{eventId}`), disparado cuando `peopleCount` baja o `capacity` sube. Una sola implementación, sin duplicación cliente/Admin SDK. |
| Vencimiento de oferta: mismo barrido de 10 min | **Cloud Scheduler** (`expireWaitlistOffers`, cada 5 min) — se evaluó Cloud Tasks por oferta (vencimiento al segundo) y se descartó por complejidad desproporcionada para una ventana de 24h. |
| `EventData.waitlistOfferedCount` (contador denormalizado, §5.2/§6.1) | **Eliminado.** Se reemplazó por una aggregate query (`sum(partySize)` sobre `status=='offered'`) calculada en el momento, dentro de la misma transacción que reclama una entrada — evita la clase de bug de "contador que alguien se olvida de actualizar". Ver `functions/src/waitlist/promote.ts`. |
| Confirmar/declinar oferta: no especificado como Callable Function | **Callable Functions** (`confirmWaitlistOffer`, `declineWaitlistOffer`, `promoteWaitlistEntry`) — la creación del `guests` doc real (la escritura de mayor riesgo de todo el sistema) vive en Cloud Functions, no en el cliente. |
| Pestaña "Lista de espera" en `EventDetail.tsx` con `Tabs.tsx` (§4.1) | **Sección apilada**, no una pestaña — `EventDetail.tsx` no tenía ningún patrón de tabs antes de esta feature y no se justificó introducirlo solo para esto. Ver `src/components/WaitlistPanel.tsx`. |
| `waitlistToken` único (implícito en varias secciones) | **Dos tokens separados**: `waitlistToken` (larga vida, solo lectura de estado) y `offerToken` (corta vida, generado solo al ofertar, exigido para confirmar/declinar) — fix de seguridad de la revisión de arquitectura previa a la implementación. |
| Rules de `waitlist` con ramas de organizador para promover/ofertar (§11) | Mucho más simples: el cliente solo puede `create` (unirse), leer por token, mover `priorityBoost` (solo subir) y `status: waiting→removed`. Todo lo demás es `if false` — exclusivo de Cloud Functions (Admin SDK). |
| Notificación por email: cola `notificationQueue` + barrido | Envío inline dentro de la Cloud Function que ofrece el lugar (`sendOfferEmail`, `functions/src/waitlist/notify.ts`), con el mismo patrón de dedup (`sendLog.create()`) y presupuesto compartido (`sendBudget`) ya usado por los scripts existentes — sin cola nueva. |

**Fix de un caso borde real, no contemplado originalmente:** si una oferta está activa reservando el último lugar y el organizador agrega un invitado a mano (o alguien más se autoregistra) al mismo tiempo, el alta manual podía "pisar" el lugar ya prometido. `src/firebase/attendeeLimit.ts` (`remainingCapacity`/`assertCapacityAvailable`) ganó un parámetro `offeredCount`, consultado antes de cada transacción de alta (`registerWalkInGuest`, `addGuest`, `addGuestsBulk`, `addGuestsFromRows`, `updateGuest`) vía la Callable `getOfferedWaitlistCount`.

**Código nuevo:** `functions/` (Cloud Functions v2, proyecto Node aparte, `npm run test:functions` en la raíz), `src/firebase/waitlist.ts`, `src/pages/WaitlistStatus.tsx` (ruta `/waitlist/:eventId?token=`), `src/components/WaitlistPanel.tsx`, cambios en `EventJoin.tsx`/`EventDetail.tsx`/`firestore.rules`/`firestore.indexes.json`/`src/types/index.ts`. 291 tests nuevos entre `test:firebase` y `test:functions`, todos verdes; build/lint/tsc limpios.

**Pendiente (responsabilidad del usuario, como todo deploy en este proyecto):** `firebase deploy --only firestore:rules,firestore:indexes,functions`, configurar los secrets `BREVO_API_KEY`/`BREVO_SENDER_EMAIL` en Secret Manager (`firebase functions:secrets:set`), y — como precondición ya existente — deployar también `firestore.rules` de `CAPACITY_LIMIT_ARCHITECTURE.md` (sin el límite duro activo, la lista de espera no tiene ningún camino que la alimente).

**Deploy a producción: completado (2026-08-01).** Fricciones reales del primer deploy de Cloud Functions en este proyecto (Secret Manager deshabilitado, IAM de Eventarc con propagación tardía en el primer trigger v2, Brevo nunca configurado ni para esto ni para los recordatorios de RSVP existentes) — ver `project_waitlist_v1_blaze.md` en la memoria del proyecto para la receta completa si se repite en otro entorno.

---

## Banner de implementación — Fase 2, Reconfirmación (2026-08-01, mismo día que el deploy de la Fase 1)

Se implementó la reconfirmación de asistencia con **dos decisiones de producto distintas a la recomendación de este RFC**, tomadas explícitamente por el usuario antes de implementar:

1. **Sin WhatsApp.** Reconfirmación usa el mismo canal de email (Brevo) que ya construyó la Fase 1 — cero setup nuevo. WhatsApp Business API (§10) sigue sin construirse, para lista de espera y para reconfirmación.
2. **Liberación 100% manual — se descarta la "ventana de gracia automática de 48h" que este RFC recomendaba en §1.2.** El barrido diario (`sweepReconfirmations`) marca "en riesgo" (`reconfirmStatus:'expired'`) a quien vence su plazo sin responder, pero **nunca libera el lugar solo** — el organizador tiene que apretar "Liberar lugar" a mano en el panel del dashboard, en cada caso. Es más cerca de la idea original del usuario (§1 de este documento) que de mi recomendación — la ventana de gracia automática quedó descartada, no solo pospuesta.

**Simplificación propia, no pedida por el usuario pero adoptada durante la implementación:** este RFC (§8.4) proponía que liberar un lugar por reconfirmación vencida NO borre el `guests` doc — que quede como registro histórico con `reconfirmStatus:'expired'`, sin contar como ocupante, con el QR invalidado. Se descartó: este proyecto no tiene ningún patrón de soft-delete/papelera en ningún lado (`deleteGuest`, la autocancelación, todo es hard delete), y agregar la primera excepción exigía tocar `checkInGuest`/`GuestPass.tsx` para un beneficio modesto (que soporte vea "expiró" en vez de un 404). **"Liberar lugar" llama directo a `deleteGuest`** (`src/firebase/guests.ts`, ya existente, ya testeado) — mismo comportamiento que cualquier otra baja del organizador. Como ya decrementa `peopleCount`, el trigger `onCapacityFreed` de la Fase 1 dispara la cascada de lista de espera automáticamente, sin wiring nuevo. Consecuencia: **no hizo falta ninguna Cloud Function para "liberar"**, es una llamada de cliente que el organizador ya tenía disponible.

Tampoco hay protección server-side especial contra liberar a alguien que ya pagó — se descubrió durante el diseño que este proyecto nunca tuvo esa protección para `deleteGuest` en general (el organizador siempre pudo eliminar a un invitado pagado desde `GuestList`, para casos legítimos como un reembolso gestionado fuera de la plataforma), así que agregar una excepción solo para el flujo de reconfirmación habría sido inconsistente. La protección real es de producto/UI: `startReconfirmCampaign` excluye pagados del targeting por defecto (`includePaid`)~~, y `ReconfirmPanel.tsx` no ofrece el botón "Liberar lugar" para un invitado con `paymentStatus === 'paid'`. **`includePaid` se eliminó del todo al día siguiente — ver el banner de Fase 3 más abajo.**

**Código nuevo:** `functions/src/reconfirm/` (`campaign.ts` + `sweep.ts`, núcleo testeable), `functions/src/callable/startReconfirmCampaign.ts`, `functions/src/scheduled/sweepReconfirmations.ts` (Cloud Scheduler diario, 13:00 UTC — mismo horario que ya usaba `rsvp-reminders.yml`), `src/firebase/reconfirm.ts`, `src/components/ReconfirmPanel.tsx`, `src/components/StartReconfirmCampaignModal.tsx`, banner en `GuestPass.tsx`, 2 ramas nuevas en `firestore.rules` (`guests/{guestId}`), campos nuevos en `GuestData`/`EventData` (`src/types/index.ts`). `functions/src/lib/permissions.ts`: `canManageWaitlist` renombrado a `canManageGuests` (ya lo usan dos features, no solo lista de espera). 66 tests nuevos entre `test:firebase` y `test:functions`, todos verdes; build/lint/tsc limpios.

**Pendiente (usuario):** commit/push, `firebase deploy --only firestore:rules,firestore:indexes,functions` (agrega 2 funciones nuevas: `startReconfirmCampaign`, `sweepReconfirmations` — no debería repetir la fricción de IAM/Eventarc de la Fase 1, ninguna de las dos usa un trigger de Firestore, son Callable/Scheduler).

---

## Banner de implementación — Fase 3, ajustes pedidos tras probar la Fase 1/2 (2026-08-02)

Tres pedidos del usuario después de usar lo ya implementado, los tres simplificando el diseño original:

1. **Se eliminó el vencimiento automático de 24h de las ofertas de lista de espera** (`OFFER_WINDOW_MS`/`expireWaitlistOffers`, Cloud Scheduler de la Fase 1) — mismo criterio que ya eligió el usuario para reconfirmación en la Fase 2 (liberación 100% manual, nunca automática por tiempo). `attemptPromote` (`functions/src/waitlist/promote.ts`) ahora solo bloquea ofertar si el evento está a menos de `MIN_TIME_BEFORE_EVENT_MS` (2h) de empezar — ya no hay ninguna transición temporizada. En su lugar, el organizador tiene un botón manual **"Cancelar oferta"** (`cancelWaitlistOffer`, Callable nueva) que revierte la entrada a `waiting` en su misma posición de fila y dispara la cascada excluyéndola a ella misma (si no, se reofrecería a sí misma de inmediato — `runCascade` ganó un parámetro `excludeIds` para esto). Se borraron `functions/src/waitlist/expire.ts` y `functions/src/scheduled/expireOffers.ts` enteros. **Bug real encontrado y corregido durante el cambio:** `confirmWaitlistOffer.ts` tenía un chequeo `offerExpiresAt <= Date.now()` que, al quedar `offerExpiresAt` permanentemente `null`, evaluaba siempre a `true` — habría roto toda confirmación de oferta en producción de no corregirse.
2. **`includePaid` se eliminó del todo de la reconfirmación** — ya no es un checkbox del organizador (`StartReconfirmCampaignModal.tsx`), es una regla fija: `startCampaign` (`functions/src/reconfirm/campaign.ts`) siempre excluye `paymentStatus === 'paid'`, sin excepción posible. Simplifica el modelo de datos (un campo menos en `EventData.reconfirmCampaign`) y el copy (ya no hace falta explicar la opción "no recomendada").
3. **Nueva acción "Enviar a lista de espera"**, para el caso del día del evento: un invitado sin pagar que no llega puede pasarse a la lista de espera en vez de eliminarlo — libera su lugar igual (dispara la cascada vía `onCapacityFreed`, como cualquier baja) pero conserva su registro por si aparece más tarde, y deja el lugar disponible para quien sí está esperando en la puerta. `moveGuestToWaitlist` (`src/firebase/guests.ts`, junto a `deleteGuest`, mismo patrón de contadores) borra el `guests`/`guestContacts` del invitado y crea una entrada `waitlist` nueva con su nombre/contacto/`customData` carried over. Disponible desde `GuestDetailSheet.tsx` (mismo lugar que "Eliminar invitado"), gateado por `canDeleteGuests` (mismo permiso que la baja, porque siempre viaja en el mismo batch), `attendeeLimitEnabled` del evento (sin cupo duro no hay cascada que dispare) y `paymentStatus !== 'paid'` (nunca se le quita el lugar a quien ya pagó, mismo criterio que el resto de esta feature). Nueva rama de rules `canOrganizerCreateWaitlistEntry` en `waitlist/{entryId}` — a diferencia del alta pública (`canJoinWaitlist`), no exige `entryMode`/`attendeeLimitEnabled` (lo decide el organizador, no la configuración pública) ni cap de `partySize` contra `maxCompanions` (el invitado ya existía con ese tamaño).

**Código nuevo/cambiado:** `functions/src/waitlist/promote.ts`, `cascade.ts`, `callable/cancelWaitlistOffer.ts` (nueva), `callable/confirmWaitlistOffer.ts` (fix), `waitlist/notify.ts` (copy); `functions/src/reconfirm/campaign.ts`, `callable/startReconfirmCampaign.ts`; `src/firebase/guests.ts` (`moveGuestToWaitlist`), `waitlist.ts` (`cancelWaitlistOffer`), `reconfirm.ts`; `src/components/GuestList/GuestDetailSheet.tsx` + `GuestList.tsx`, `WaitlistPanel.tsx`, `StartReconfirmCampaignModal.tsx`, `EventJoin.tsx`/`WaitlistStatus.tsx` (copy); `firestore.rules` (`canOrganizerCreateWaitlistEntry`). Archivos borrados: `functions/src/waitlist/expire.ts` (+ su test), `functions/src/scheduled/expireOffers.ts`. Tests nuevos/actualizados en ambas suites, todos verdes (268 `test:firebase`, 63 `test:functions`); build/lint/tsc limpios.

**Pendiente (usuario):** commit/push, `firebase deploy --only firestore:rules,functions` (borra `expireWaitlistOffers` del proyecto, agrega `cancelWaitlistOffer`).

---

## 0. Resumen ejecutivo

| Aspecto | Decisión |
|---|---|
| Colección nueva | `events/{eventId}/waitlist/{entryId}` — separada de `guests`, tal como ya lo anticipaba `CAPACITY_LIMIT_ARCHITECTURE.md §12`. |
| Campos nuevos en `EventData` | `waitlistOfferedCount` (cuántas ofertas de promoción están activas ahora mismo, no confirmadas ni vencidas) y `reconfirmCampaign` (metadata de la campaña activa, si hay una). |
| Campos nuevos en `GuestData` | `reconfirmStatus?: 'requested' \| 'confirmed' \| 'expired'`, `reconfirmDeadline?: number \| null`. Ningún campo de `holdExpiresAt` nuevo sobre `guests` — ver §7.4 sobre por qué. |
| Cloud Functions | Cero, igual que el resto del proyecto (plan Spark). Todo vía `runTransaction` de cliente + un cron nuevo de GitHub Actions (mismo patrón que `send-notifications.yml`/`rsvp-reminders.yml`). |
| Tu idea del "lugar reservado 24h" | **Se mantiene, es la pieza correcta del diseño.** Es justo lo que le faltaba a un sistema puramente FIFO-automático: le da a la persona una oportunidad real de reaccionar. Se detalla el mecanismo exacto en §6-7. |
| Tu flujo de reconfirmación propuesto | **Se modifica en un punto central:** "el organizador revisa" no puede ser un paso manual obligatorio (no escala) — pasa a ser un período de gracia automático + visibilidad en el dashboard, con override manual opcional. Se explica el porqué en §1. |
| Notificaciones automáticas al invitado | Canal primario: **WhatsApp Business API (Meta Cloud API)** para los dos momentos críticos (oferta de lugar, reconfirmación por vencer) — decisión tomada explícitamente el 2026-07-31 sabiendo que agrega una dependencia paga nueva y un requisito de setup previo (verificación de negocio + plantillas aprobadas por Meta). Respaldo: email server-side vía Brevo (ya usado por `send-rsvp-reminders.mjs`). Se detalla todo en §10. |
| Pago vs. lista de espera vs. reconfirmación | Un invitado `paid` nunca entra a reconfirmación ni pierde su lugar automáticamente — es la única señal de compromiso real que la plataforma puede verificar. |

---

## 1. Crítica del diseño propuesto (lectura de Product Manager)

Pediste explícitamente que cuestione el diseño antes de construirlo. Esto es lo que cambiaría y por qué.

### 1.1 Lo que está bien y se mantiene tal cual

**El concepto de "lugar reservado" con ventana de reacción es el corazón correcto del sistema.** Sin él, un FIFO puramente automático tiene un defecto real: promueve a alguien que quizás ya perdió el interés (pasaron semanas desde que se anotó) y le quita el lugar a alguien de atrás sin darle a nadie la chance de decir "sí, todavía quiero ir". Tu instinto de copiar el patrón de aerolíneas/restaurantes es acertado — es una interacción que la gente ya entiende sin explicación, que es exactamente lo que buscás.

**FIFO con prioridad manual del organizador** también es correcto tal cual lo planteaste: automático por defecto, override humano disponible. No hay tensión ahí.

### 1.2 Lo que cambia: "el organizador revisa" no puede ser un paso obligatorio

Tu flujo propuesto tiene este paso:

```
Fecha límite vencida → Lugar reservado temporalmente → El organizador revisa → Liberar lugar
```

El problema: si liberar el lugar depende de que una persona revise caso por caso, el sistema deja de resolver el problema que lo motiva. Dijiste "quiero recuperar esos lugares antes del evento" — para un evento de 300 invitados con 40 sin pagar, pedirle al organizador que revise 40 casos uno por uno la noche antes del evento es exactamente el trabajo manual que esta función existe para evitar. Y si el organizador no llega a revisar (viaja, se olvida, es la semana del evento y está ocupado con logística real), el sistema completo queda trabado — la reconfirmación nunca libera nada y volvés al problema original.

**Reemplazo propuesto:** el paso manual no desaparece, pero deja de ser un gate — se convierte en una **ventana de gracia automática con override opcional**:

```
CONFIRMADO
  ↓
Reconfirmación solicitada (con recordatorios, no un solo aviso — ver §8.2)
  ↓
Fecha límite vencida → estado "en riesgo", el invitado TODAVÍA puede reconfirmar
  ↓
Ventana de gracia (48h por defecto) → dashboard muestra el caso, organizador PUEDE
  actuar ("liberar ahora" / "dar más tiempo" / no hacer nada)
  ↓
Si nadie reconfirma ni el organizador actúa: se libera automáticamente al vencer
  la gracia → dispara promoción de lista de espera
```

Esto resuelve tu preocupación real ("no quiero que alguien pierda su lugar injustamente por no ver una notificación") de una forma que sí escala: la persona tiene *dos* respaldos, no uno — la ventana de gracia después del vencimiento, y varios recordatorios antes (§8.2) — sin que el sistema dependa de que un humano esté mirando el dashboard en el momento exacto.

### 1.3 Lo que cambia: el paralelismo con el sistema que ya eliminaste

Es importante que lo tengas presente antes de aprobar esto: en julio ya construiste un mecanismo muy similar (`holdExpiresAt`, cronómetro de reserva de pago) y lo **eliminaste por completo** poco después porque, viendo el uso real de la plataforma, resultó ser complejidad que nadie necesitaba (ver `project_remove_reservation_hold_v1`). Este RFC reintroduce un cronómetro — dos, en realidad: el de la oferta de promoción (§6) y el de la reconfirmación (§8).

No estoy proponiendo deshacer esa decisión sin más — creo que esta vez es diferente en un punto concreto: el cronómetro anterior corría sobre **todo registro por transferencia**, siempre, aunque el evento nunca se llenara — complejidad constante para un beneficio que solo aplicaba en el caso raro de sobreventa. Este cronómetro nuevo **solo existe cuando ya hay escasez real** (el evento se llenó, hay gente esperando) — es proporcional al problema, no una capa que todos los eventos cargan siempre. Aun así, te lo marco explícitamente en vez de dejarlo pasar en silencio: si en la práctica ves que la mayoría de tus eventos nunca llegan a llenarse, este sistema entero queda inerte (que está bien, es opt-in — ver §2), pero si alguno sí se llena y ves que el cronómetro genera la misma fricción que el anterior, la salida de emergencia es la misma que ya usaste una vez: sacar el reloj y dejar la promoción/reconfirmación como acciones puramente manuales del organizador. Te lo dejo como decisión explícita en §16, no como algo que se asume.

### 1.4 Una simplificación que recomiendo: no diseñar "pago parcial"

Preguntás qué pasa si alguien "pagó parcialmente". El modelo de pagos actual de PaseLink (`GuestData.paymentStatus`) es binario: `unpaid | pending_confirmation | paid | expired` — no existe un concepto de depósito o pago parcial en ningún lugar del código. Diseñar reglas para un estado que no existe sería construir sobre una hipótesis, no sobre la plataforma real. Si en el futuro agregás pagos parciales, se resuelve entonces, con el modelo de pagos real de ese momento — no lo incluyo en este RFC.

---

## 2. Alcance: opt-in, y solo tiene efecto si el límite de asistentes está activo

Igual que `attendeeLimitEnabled`, esto es una función que un evento puede no usar nunca. Dos interruptores independientes, ambos opcionales:

- **Lista de espera:** no es un interruptor aparte — existe automáticamente en cualquier evento con `attendeeLimitEnabled: true`. Si el organizador activó el cupo duro, la lista de espera es simplemente lo que reemplaza a la pantalla "evento lleno" sin alternativa. No tiene sentido ofrecerla como opción separada: la alternativa a "vas a la lista de espera" es "te rechazamos sin más", que es peor experiencia y no es lo que pediste.
- **Reconfirmación:** sí es una campaña que el organizador inicia a mano, evento por evento, cuando quiere ("Confirma que realmente asistirás"). Un evento con cupo lleno puede no usar reconfirmación nunca y su lista de espera solo avanza por bajas naturales (cancelaciones, eliminaciones). Reconfirmación es la herramienta para *forzar* la rotación cuando las bajas naturales no alcanzan.

---

## 3. Diseño UX — invitado

### 3.1 Se llena el cupo: unirse a la lista de espera

`EventJoin.tsx` ya tiene el estado `'full'` (de `CAPACITY_LIMIT_ARCHITECTURE.md`, pendiente de deploy). En vez de terminar ahí, ese mismo estado gana un formulario reducido (nombre, teléfono/email, acompañantes — los mismos campos que ya pide el registro normal) y un botón "Unirme a la lista de espera":

```
🎟️  Este evento alcanzó su capacidad máxima.

     Podés anotarte en la lista de espera. Si se libera
     un lugar, te avisamos automáticamente.

     [ Nombre ] [ Teléfono ] [ Email (opcional) ]
     [ Unirme a la lista de espera ]
```

Al enviar, se crea un documento en `waitlist` (§5) — nunca en `guests` (invariante clave: todo lo que vive en `guests` tiene un lugar confirmado, se mantiene igual que hoy).

Confirmación:

```
✅ Te agregamos a la lista de espera.

     Posición: #14
     Te avisaremos por [email/WhatsApp] si se libera un lugar.

     Guardá este link para consultar tu estado: [link]
```

El link lleva un token propio (`waitlistToken`, generado igual que `qrToken`) embebido en la URL — el mismo principio de acceso sin login que ya usa el pase (`GuestPass.tsx` vía `qrToken`), no una cuenta.

### 3.2 Pantalla de estado de la lista de espera

Página nueva y liviana (`/waitlist/:eventId/:entryId?token=...`), reutilizando el mismo patrón de acceso por token que `GuestPass.tsx`:

- **Esperando:** posición actual (recalculada en cada carga vía `getCountFromServer`, no un contador que haya que mantener a mano), mensaje "seguís en la fila".
- **Te ofrecieron un lugar:** el estado más importante — ver §3.3.
- **Ya tenés un lugar (promovido):** redirige directo al pase normal (`/pass/:eventId/:qrToken`), la vista de waitlist deja de ser relevante.
- **La oferta venció / declinaste:** mensaje claro, sin culpar al usuario ("El lugar que se liberó ya fue asignado a otra persona. Seguís en la lista de espera para el próximo que se libere" — si vuelve a la fila, ver §7.3 — o "Ya no hay lugares disponibles" si el organizador cerró la lista).

### 3.3 Recibir la oferta de un lugar

Este es el momento central de tu idea, sin cambios respecto a lo que propusiste:

```
🎉  ¡Se liberó un lugar para vos!

     Confirmá tu asistencia antes del [fecha/hora, +24h].
     Si no respondés, le ofrecemos el lugar a la
     siguiente persona en la fila.

     [ Confirmar mi lugar ]
```

Al confirmar: si el evento requiere pago, sigue el flujo de pago que ya existe hoy para cualquier invitado nuevo (transferencia/efectivo, `submitPaymentProof`, etc.) — la oferta de lista de espera no inventa un flujo de pago paralelo, solo destraba la creación del `guests` doc con el mismo camino de siempre.

### 3.4 Reconfirmación de asistencia (invitado ya confirmado)

Banner no bloqueante en `GuestPass.tsx` (mismo lugar donde hoy aparecen los avisos de "confirmá tu comprobante de pago"):

```
⏰  El organizador pidió reconfirmar tu asistencia.
    Respondé antes del [fecha] para no perder tu lugar.
    [ Sí, voy a asistir ]
```

Un solo tap ("Sí, voy a asistir") — sin fricción, sin re-pedir datos ya cargados. Si venció el plazo y está en ventana de gracia (§1.2), el banner sube de urgencia visual pero el botón sigue funcionando exactamente igual (reconfirmar en gracia también cuenta como éxito, cancela la liberación pendiente).

---

## 4. Diseño UX — organizador

### 4.1 Ubicación: pestaña nueva dentro de `EventDetail`, no una ruta aparte

Se agrega una pestaña "Lista de espera" junto a las que ya existen en `EventDetail.tsx` (mismo componente `Tabs.tsx` de la infraestructura de accesibilidad ya construida), visible solo si `attendeeLimitEnabled`. Se descarta una ruta/página separada: la lista de espera es una vista más de "gestión de invitados de este evento", no un módulo aparte — mantenerla junto a `GuestList` es donde el organizador ya la va a buscar.

### 4.2 Contenido de la pestaña

```
┌─────────────────────────────────────────────┐
│ Lista de espera (23)      Ofertas activas: 2 │
├─────────────────────────────────────────────┤
│ #1  Juan Pérez        esperando · 3 días     │  [↑ Primero] [Asignar lugar] [Quitar]
│ #2  Pedro Gómez       esperando · 2 días     │  [↑ Primero] [Asignar lugar] [Quitar]
│ #3  Sofía Ibarra      OFERTA · vence en 6h   │  [Recordar] [Cancelar oferta]
│ #4  Ana López         esperando · 1 día      │  [↑ Primero] [Asignar lugar] [Quitar]
└─────────────────────────────────────────────┘
```

- **"↑ Primero"**: mueve esa entrada al frente de la fila (§7.2, no reordena el resto).
- **"Asignar lugar"**: promoción manual directa, salta el orden (tu pedido explícito).
- **"Quitar"**: rechaza la entrada (alguien que se anotó por error, duplicado, etc. — no consume su turno de oferta).

Reconfirmación, como segunda sección de la misma pestaña (solo si hay una campaña activa o histórica):

```
┌─────────────────────────────────────────────┐
│ Reconfirmación · vence 2026-08-05            │
├─────────────────────────────────────────────┤
│ Confirmaron: 142     Pendientes: 18          │
│ En gracia (venció, sin liberar aún): 4       │  [Liberar ahora] [Dar 48h más] (por fila)
├─────────────────────────────────────────────┤
│ [ Iniciar nueva campaña de reconfirmación ]  │
└─────────────────────────────────────────────┘
```

No se agrega una colección de historial/auditoría separada en esta v1 — cada documento (`waitlist` entry, `guests` doc con `reconfirmStatus`) ya conserva sus propios timestamps (`createdAt`, `offeredAt`, `respondedAt`) y eso alcanza para reconstruir "qué pasó" en el dashboard sin mantener un log aparte. Se agrega un log dedicado más adelante solo si en el uso real hace falta ver una línea de tiempo que los campos actuales no puedan mostrar — no de entrada, para no repetir el patrón de complejidad-que-no-se-usó de `holdExpiresAt`.

### 4.3 Configurar una campaña de reconfirmación

Modal simple, no un wizard:

```
Iniciar reconfirmación

A quién le pedimos reconfirmar:
  ☑ Invitados confirmados sin pagar (recomendado)
  ☐ Todos los confirmados (incluye ya pagados — no recomendado)
  Excluir etiqueta: [ VIP ▾ ]   ← solo aparece si el evento tiene guestTags

Fecha límite: [ 2026-08-05 ]   (mínimo 48h antes del evento, ver §8.1)

Recordatorios: 3 días antes · 1 día antes   (igual al mecanismo ya
  existente de recordatorios de RSVP, mismo componente)
```

"Todos los confirmados" queda disponible pero deliberadamente desalentado (nunca se ofrece marcado por defecto) — reconfirmarle a alguien que ya pagó es un pedido que puede sentirse hostil ("¿desconfían de mí después de que pagué?"), y no gatilla nada útil: un `paid` nunca pierde su lugar automáticamente pase lo que pase con su reconfirmación (§9).

---

## 5. Modelo de datos

### 5.1 Colección nueva: `events/{eventId}/waitlist/{entryId}`

```ts
interface WaitlistEntryData {
  id: string
  name: string
  partySize: number              // 1 + acompañantes, igual que partySize() de guests
  // contacto vive acá mismo (no hay equivalente a guestContacts para
  // waitlist — es una entrada efímera, no un invitado con historial largo)
  phone?: string
  email?: string
  phoneCountry?: string
  waitlistToken: string          // acceso sin login, mismo principio que qrToken
  status: 'waiting' | 'offered' | 'promoted' | 'declined' | 'expired' | 'removed'
  priorityBoost: number          // default 0; mayor = más adelante en la fila
  createdAt: number              // orden FIFO real (nunca se reescribe)
  offerExpiresAt: number | null  // solo con status 'offered'
  promotedGuestId: string | null // seteado al promover, referencia al guests doc creado
}
```

Orden de la fila: `status == 'waiting'`, `ORDER BY priorityBoost DESC, createdAt ASC`.

### 5.2 Campos nuevos en `EventData`

```ts
// Cuántas ofertas de promoción están activas ahora mismo (status 'offered',
// sin vencer) — se usa para no ofrecer de más mientras hay ofertas pendientes
// de respuesta. Mantenido atómicamente igual que paidCount/peopleCount, NO
// es un valor derivado por query.
waitlistOfferedCount?: number

// Metadata de la campaña de reconfirmación activa (o la última, si ya
// cerró) — un solo objeto, no una subcolección: una campaña por vez.
reconfirmCampaign?: {
  startedAt: number
  deadline: number
  targetPaidOnly: boolean        // false = incluye pagados (desalentado, §4.3)
  excludeTagIds?: string[]
  reminderRules: { daysBeforeDeadline: number }[]  // reutiliza la forma de EventData.reminderRules existente
}
```

### 5.3 Campos nuevos en `GuestData`

```ts
// Ausente = nunca fue parte de ninguna campaña de reconfirmación.
reconfirmStatus?: 'requested' | 'confirmed' | 'expired'
reconfirmDeadline?: number | null
```

Deliberadamente **no** se llama `holdExpiresAt` ni se reutiliza ese campo huérfano — es un campo distinto con una semántica distinta (plazo de reconfirmación, no plazo de pago), y reutilizar el nombre de un campo que se documentó como "legacy, nadie lo lee" (`project_remove_reservation_hold_v1`) generaría confusión al releer el código dentro de un año.

---

## 6. La oferta de promoción: el mecanismo central

### 6.1 Qué pasa cuando se libera un lugar

Un lugar se libera cuando `peopleCount` baja (cualquiera de sus caminos ya existentes: `deleteGuest`, auto-cancelación del invitado, RSVP→'no' si en el futuro decrementa, rechazo de pago, o — nuevo en este RFC — liberación por reconfirmación vencida, §8.4). Cada uno de esos caminos, después de decrementar `peopleCount`, intenta un **cascada de oferta best-effort**:

```
remaining = capacity - peopleCount - waitlistOfferedCount
si remaining > 0:
  buscar la próxima entrada 'waiting' (ORDER BY priorityBoost DESC, createdAt ASC, LIMIT 1)
  si existe:
    runTransaction:
      releer la entrada — confirmar que sigue en 'waiting' (por si alguien más ya la reclamó)
      set status: 'offered', offerExpiresAt: now + 24h
      event.waitlistOfferedCount += 1
```

**Por qué "best-effort" y no un loop garantizado:** si dos liberaciones ocurren casi al mismo tiempo (§13, caso "dos lugares se liberan a la vez"), ambos intentos leen la fila de forma no transaccional (una query no puede ir dentro de la misma transacción que la garantiza atómica) — existe una ventana chica donde ambos podrían intentar ofrecer a la misma entrada. La transacción de claim (releer y confirmar `status == 'waiting'` antes de escribir) hace que **como mucho uno de los dos gane** — el otro simplemente no logra ofertar en ese instante. Nunca se promueve de más (la transacción lo impide), en el peor caso alguien queda sin oferta un rato de más.

### 6.2 La red de seguridad: barrido periódico

Igual que el desaparecido `sweep-reservations.mjs` pero con responsabilidad más chica — `scripts/sweep-waitlist.mjs`, mismo patrón (`firebase-admin`, GitHub Actions cron, sin Blaze):

- Cada 10 minutos (mismo intervalo que ya usaba el barrido de reservas):
  1. Vence ofertas: `waitlist` con `status == 'offered' AND offerExpiresAt <= now` → `status: 'expired'`, `event.waitlistOfferedCount -= 1`.
  2. Por cada oferta recién vencida, intenta la misma cascada de §6.1 (ofertar al siguiente).
  3. Cualquier lugar que quedó sin ofertar por la condición de carrera de §6.1 (`remaining > waitlistOfferedCount` pero nadie fue ofertado) se corrige acá — es el mismo rol que cumplía el barrido viejo: la garantía *eventual*, mientras el camino inline da la sensación de instantaneidad en el caso común.

Esto reproduce, a propósito, el mismo diseño de dos capas que ya está probado en este proyecto (camino inline optimista + cron como garantía de fondo) — no es una técnica nueva para PaseLink.

### 6.3 Duración de la oferta: 24h fijas, con un piso para eventos inminentes

24h por defecto, sin configuración por evento (coherente con "no quiero configuraciones complicadas", ya aplicado en el RFC de capacidad). Único ajuste automático: si al evento le quedan menos de 24h, la oferta vence en el **tiempo restante hasta el evento menos 2 horas** (nunca una oferta que vence después de que el evento ya empezó). Por debajo de 2 horas restantes, dejar de ofertar automáticamente y mostrarle al organizador un aviso en el dashboard ("Quedan lugares liberados sin ofertar automáticamente por estar muy cerca del evento — asigná manualmente si querés") — a esa distancia del evento, es mejor que decida una persona, no un cronómetro.

---

## 7. FIFO y prioridad manual

### 7.1 Por qué `priorityBoost` y no reescribir `createdAt`

Mover a alguien "al primer lugar" en una lista de 500+ personas **no** se implementa reordenando: eso implicaría reescribir el campo de orden de todas las entradas que quedan detrás, un costo que crece con el tamaño de la fila (exactamente el escenario "más de 1.000 esperando" que pediste analizar). En cambio:

- `priorityBoost` empieza en `0` para todos.
- "Mover al primer lugar" = leer el `priorityBoost` más alto actual entre las `'waiting'` y escribir `max + 1` en la entrada elegida. **Una sola escritura**, sin importar cuánta gente hay en la fila.
- El orden real de desempate sigue siendo `createdAt` — dos personas con el mismo `priorityBoost` (el caso común: nadie fue movido) mantienen FIFO puro entre ellas.

### 7.2 "Asignar directamente un lugar"

Es la misma operación de promoción de §6.1/§7, pero el organizador elige la entrada objetivo en vez de que la elija la query "próximo de la fila". No hace falta un mecanismo aparte.

### 7.3 Qué pasa si alguien vuelve a la fila

Si una oferta vence sin respuesta (`status: 'expired'`), la persona **no vuelve automáticamente a `'waiting'`** — quedaría en una posición ambigua (¿su lugar original por `createdAt`, o al final?). Se trata como una oportunidad perdida, igual que en aerolíneas/restaurantes reales: si quiere seguir esperando, se anota de nuevo desde `EventJoin.tsx` (nueva entrada, nuevo `createdAt`, al final de la fila real). Se documenta explícitamente porque es una decisión de producto, no un detalle técnico — está en §16 para tu confirmación.

---

## 8. Reconfirmación: reglas de negocio

### 8.1 Cuándo y con cuánta anticipación

El organizador elige la fecha límite libremente, con un piso impuesto por UI: **no se puede fijar a menos de 48h antes del evento**. Por debajo de eso no queda tiempo útil para que la cascada de promoción (§6) le dé 24h de oferta a alguien de la lista de espera antes de que el evento empiece. El sistema no sugiere una anticipación "ideal" fija (depende demasiado del evento — un cumpleaños de 30 personas no necesita la misma anticipación que una boda de 300 con catering cerrado una semana antes), pero el modal (§4.3) muestra una nota dinámica: "Con esta fecha, la lista de espera tendrá aproximadamente N días para reasignar los lugares liberados" para que el organizador vea la consecuencia de su elección.

### 8.2 Repetición: recordatorios sí, campaña completa también

Dos niveles distintos, no confundir:

- **Recordatorios dentro de una misma campaña:** sí, varios, reutilizando la forma que ya existe para RSVP (`reminderRules: {daysBeforeDeadline}[]`, mismo componente de configuración, mismo motor de envío — `send-rsvp-reminders.mjs` se generaliza para leer también `reconfirmCampaign.reminderRules` en vez de escribir un script paralelo).
- **Relanzar una campaña nueva:** sí, sin restricción — cuando la campaña activa cierra (todos resueltos o el organizador la cierra a mano), el organizador puede iniciar una nueva. `reconfirmStatus` de cada invitado se resetea a `'requested'` con el nuevo plazo al iniciar la campaña siguiente.

### 8.3 A quién le llega (resumen de §1.4 y §4.3)

| Tipo de invitado | ¿Entra en la reconfirmación por defecto? |
|---|---|
| Confirmado, sin pagar (evento con pago) | Sí — es el caso que motiva la función. |
| Confirmado, pagado | No (casilla separada, desalentada, nunca gatilla liberación — §9). |
| VIP (con `guestTags`/`vipTagId`) | Se ofrece un filtro de exclusión explícito en el modal — el organizador decide, no es automático. |
| Agregado manualmente por el organizador | Sí, mismo criterio que cualquier confirmado — el canal de alta no cambia el riesgo real de no-show. |
| Evento gratuito (sin pago) | La casilla de pago no aplica; se ofrece igual sobre "todos los confirmados" para eventos con lista de espera activa que necesiten rotar gente inactiva. |

### 8.4 Vencimiento → gracia → liberación (el reemplazo de §1.2)

```
reconfirmStatus: 'requested', reconfirmDeadline = X
  ↓ (invitado toca "Sí, voy a asistir" en cualquier momento antes de la liberación final)
  → reconfirmStatus: 'confirmed'. Fin, no vuelve a pedirse hasta la próxima campaña.

  ↓ (pasa reconfirmDeadline sin respuesta)
  → reconfirmStatus: 'expired'. NO se libera el lugar todavía.
  → Aparece en el dashboard, sección "en gracia" (§4.2).
  → Ventana de gracia: 48h fijas desde reconfirmDeadline.

  ↓ (durante la gracia, cualquiera de estos dos cierra el caso)
     (a) el invitado igual reconfirma → 'confirmed', cancela la liberación.
     (b) el organizador toca "Liberar ahora" → liberación inmediata, salta el resto de la gracia.

  ↓ (vence la gracia sin (a) ni (b))
  → liberación automática: decrementa peopleCount, dispara la cascada de §6.1.
    El guests doc NO se borra (a diferencia de deleteGuest) — se conserva como
    registro histórico con reconfirmStatus:'expired' y deja de contar como
    ocupante. Sigue siendo consultable (soporte: "¿qué pasó con mi invitación?"
    no cae en un 404), pero su QR deja de dar acceso válido.
```

"Dar 48h más" (botón del dashboard) simplemente reescribe `reconfirmDeadline` hacia adelante y vuelve el estado a `'requested'` — reutiliza la misma máquina de estados, no es un camino aparte.

---

## 9. Relación con pagos

| Situación | Efecto sobre lista de espera / reconfirmación |
|---|---|
| Invitado ya pagó (`paymentStatus: 'paid'`) | Nunca entra a la lista de espera (no aplica, ya tiene lugar). Nunca pierde su lugar por reconfirmación vencida, ni siquiera si el organizador lo incluyó por error en una campaña con "todos los confirmados" — la liberación automática de §8.4 chequea `paymentStatus !== 'paid'` como condición dura antes de liberar, no solo como default de la UI. Es la única regla de esta sección que se aplica también como código, no solo como copy — es la protección contra "le quitamos el lugar a alguien que ya nos dio dinero", que no tiene vuelta atrás sin un flujo de reembolso que la plataforma no tiene. |
| Invitado nunca pagó, se le venció el pago (`expired`, mecanismo ya existente) | Ya libera su lugar hoy, sin reconfirmación de por medio — este RFC no cambia ese camino, solo agrega la cascada de oferta (§6.1) al final, que hoy no promueve a nadie porque la lista de espera no existía. |
| Invitado promovido desde la lista de espera | Sigue el flujo de pago normal que ya existe para cualquier alta nueva (transferencia/efectivo) — no hay un "pago exprés" especial para lista de espera. |
| "Pagar para saltar la fila" | Explícitamente **no se construye**. La única forma de saltar el orden es la decisión manual del organizador (§7.2) — automatizar "quien paga primero pasa antes" mezcla un incentivo económico con un mecanismo de justicia de turnos y puede sentirse (y ser) injusto para quien lleva más tiempo esperando de buena fe. |

---

## 10. Notificaciones: WhatsApp como canal primario, email como respaldo

### 10.1 Lo que existe hoy (contexto de la decisión)

- **Push (FCM):** `enqueueNotification` → `notificationQueue` → `send-notifications.mjs`. Hoy **solo se usa para avisarle al organizador** (`recipientUid: ownerId`) — nunca a un invitado. No es un canal confiable como camino principal para esta feature.
- **Email server-side (Brevo):** `send-rsvp-reminders.mjs` ya manda emails reales a invitados con presupuesto de 300/día gratis — canal confiable y probado, pero solo llega a quien tiene `email` capturado, y ese campo hoy **solo se completa en autorregistro e importación CSV** (un alta manual sin email no lo tiene).
- **WhatsApp:** hoy solo enlaces `wa.me` que el organizador abre a mano (`GuestDetailSheet`) — cero envío automático.
- **Teléfono:** es el dato de contacto que más invitados tienen cargado (confirmado por vos) — `phone` + `phoneCountry` ya se capturan en 6 formularios distintos del proyecto (`project_international_phone_country_v1`) y ya se usa para construir números en formato internacional correcto vía `toWhatsAppPhone` (`src/utils/phone.ts`). Es la base de datos de contacto más completa que ya existe — más que `email`.

**Decisión (2026-07-31):** WhatsApp Business API como canal primario para los dos avisos de mayor urgencia (oferta de lugar, reconfirmación por vencer), con email como respaldo automático si el envío por WhatsApp falla o no hay número usable. Tomada sabiendo que:
- Es la primera dependencia paga recurrente que adopta el proyecto (hasta ahora todo evita costos variables — EmailJS/Brevo/Cloudinary gratis, Blaze evitado a propósito, Apple Wallet descartado por costo de licencia).
- El costo por mensaje de categoría "utility" (mensaje que inicia la plataforma, no una respuesta del invitado) se cobra desde julio de 2025 — antes era gratis dentro de la ventana de conversación de 24h. Sigue siendo, en general, más barato que SMS a la mayoría de los países de LatAm.
- Requiere un **setup previo obligatorio en Meta** antes de poder enviar un solo mensaje real (§10.4) — no es "activar una env var y listo", como sí lo fue Brevo.

### 10.2 Qué se envía por WhatsApp y por qué solo esos dos casos

WhatsApp Business API exige que todo mensaje que la plataforma inicia (no es respuesta a algo que el invitado escribió) use una **plantilla pre-aprobada por Meta** con variables fijas — no se puede mandar texto libre. Eso hace que sumar un canal nuevo tenga un costo de aprobación por cada tipo de mensaje, así que conviene ser selectivo: se reserva WhatsApp para los dos momentos donde de verdad importa que el aviso llegue rápido y se note, el resto sigue por email o ni se notifica activamente (igual que se decidió en la versión anterior de esta sección):

| Evento | Canal primario | Respaldo |
|---|---|---|
| Te anotaste en la lista de espera | Pantalla de confirmación (siempre) | Email si dejó email — no amerita plantilla de WhatsApp, no es urgente. |
| Subiste de posición | No se notifica activamente (se consulta al abrir el link, §3.2) | — |
| **¡Tenés una oferta de lugar!** | **WhatsApp** (plantilla `oferta_lugar`, §10.3) | Si el envío por WhatsApp falla (número inválido, no tiene WhatsApp, error de la API) → email automático en el mismo intento. Si tampoco hay email → queda solo el link guardado (§3.1). |
| Tu oferta vence en X horas | Un solo recordatorio a mitad de la ventana (12h), mismo canal/respaldo que arriba. |
| **Debés reconfirmar / tu plazo venció, estás en gracia** | **WhatsApp** (plantilla `reconfirmar`, §10.3) | Mismo esquema de respaldo a email. También banner en el pase (§3.4) como tercera vía, siempre activo. |

### 10.3 Plantillas necesarias (a definir y enviar a revisión de Meta)

Dos plantillas, categoría "utility" (mensaje transaccional ligado a una acción del propio invitado — no es marketing, así que no debería tener fricción de aprobación por políticas de contenido promocional):

```
oferta_lugar:
"Hola {{1}}, se liberó un lugar para vos en {{2}}. Confirmá tu
asistencia antes de {{3}} en este link: {{4}}"

reconfirmar:
"Hola {{1}}, {{2}} pidió reconfirmar tu asistencia a {{3}}.
Respondé antes de {{4}} para no perder tu lugar: {{5}}"
```

El texto final puede variar levemente si Meta lo pide en revisión — se define recién al configurar, no es parte de este RFC.

### 10.4 Prerrequisito de setup (bloquea el envío real, no bloquea programar el resto)

Antes de que un solo mensaje de WhatsApp pueda salir en producción, hace falta (una sola vez, fuera del código de esta feature):

1. Cuenta de WhatsApp Business Platform vinculada a un Meta Business Account verificado (verificación de negocio — puede tardar de horas a varios días).
2. Un número de teléfono registrado para la API (puede ser un número nuevo dedicado, no el personal del organizador).
3. Envío de las dos plantillas de §10.3 a revisión — normalmente resuelve en <24h, pero puede rechazarse y haber que reformular.
4. Token de acceso de la API (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) como secrets de servidor — mismo tratamiento que `BREVO_API_KEY` hoy: nunca en el bundle del navegador, solo en el script de GitHub Actions.

**Implicación para el plan de fases (§15):** este setup no es una tarea de código — es un trámite externo con tiempos que no controla el desarrollo. Se recomienda arrancarlo en paralelo a la Fase 1 (lista de espera, que no depende de WhatsApp) para que esté resuelto cuando llegue la Fase 2 (reconfirmación), en vez de bloquear el inicio de la implementación esperándolo.

### 10.5 Mecánica de envío (mismo patrón que Brevo, canal nuevo)

`scripts/lib/waChannel.mjs` — nuevo, mismo espíritu que `emailChannel.mjs`: server-side only, llamado desde los mismos scripts de cron que ya procesan `notificationQueue`/recordatorios (`send-notifications.mjs` se extiende para leer un canal `'whatsapp'` además de `'push'`, o se suma un script dedicado si el volumen/lógica lo justifica al implementar). Construye el número en formato E.164 reutilizando `toWhatsAppPhone`/`phoneCountry` ya existentes — no hace falta un formato de número nuevo.

Presupuesto: a diferencia de Brevo (300/día gratis, tope simple), acá el tope relevante es de **costo**, no de cantidad — se reutiliza el mismo mecanismo transaccional de `sendBudget/{fecha}` (`reserveBudgetSlot`, ya construido) pero con un techo pensado como "mensajes esperados por mes según el volumen real de tus eventos", ajustable una vez que haya datos reales de uso, no un número inventado de antemano.

Falla el envío por WhatsApp (número no tiene cuenta de WhatsApp, plantilla rechazada, error transitorio de la API) → el mismo intento cae a email si hay `email` cargado — es un `try/catch` con fallback explícito, no dos caminos independientes que haya que disparar por separado.

### 10.6 Recomendación que se mantiene: capturar email también

Aunque el teléfono es el dato más completo, seguir recomendando agregar `email` opcional al alta manual (`GuestAddForm`) para que el respaldo de §10.2/§10.5 tenga a quién llegarle cuando WhatsApp falla — sin email cargado, un fallo de WhatsApp deja al invitado dependiendo solo del link guardado. Se mantiene como sugerencia de Fase 3 (§15), no bloqueante.

---

## 11. Security Rules

Piezas nuevas, mismo estilo que los helpers ya existentes (`attendeeLimitOk`, `counterDeltaOk`):

- **Alta pública en `waitlist`** (invitado anónimo se anota): mismo criterio que el alta pública de `guests` — pinea `status == 'waiting'`, `priorityBoost == 0`, `offerExpiresAt == null`, `promotedGuestId == null`, tope de `partySize` razonable. El cliente no puede crear una entrada ya `'offered'` u `'promoted'` de entrada.
- **Lectura de `waitlist`:** el invitado solo puede leer **su propia** entrada (`request.auth` no aplica, es acceso por token — se resuelve igual que el acceso al pase hoy, comparando `waitlistToken` en la query/regla, no con una lista completa legible). Nadie externo puede listar la fila entera (privacidad: no se expone quién más está esperando).
- **Transición `offered → promoted`:** solo el propio invitado (token correcto) o el organizador/coorganizador con permiso de gestión de invitados (reutiliza el permiso ya existente de `canDo()`/`coOrganizerPermissions` de `project_cohost_permissions_v1` — no se agrega un permiso granular nuevo solo para esto, la lista de espera es una extensión de "gestionar invitados", no una categoría de permiso aparte).
- **`priorityBoost`, `status: 'offered'/'promoted'` por acción del organizador:** solo dueño/coorganizador con permiso.
- **`reconfirmStatus`/`reconfirmDeadline` en `guests`:** el invitado (por `lockTokens`, mismo mecanismo que ya protege auto-edición/auto-cancelación) solo puede escribir `reconfirmStatus: 'confirmed'` sobre su propio documento, nunca `'requested'` ni `'expired'` — esas dos las escribe la campaña (cliente organizador) o el barrido (Admin SDK), nunca el invitado.
- **`waitlistOfferedCount`, `event.reconfirmCampaign`:** solo dueño/coorganizador con permiso, mismo criterio que otros contadores/metadata de evento.

---

## 12. Índices nuevos

```json
{ "collectionGroup": "waitlist", "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "priorityBoost", "order": "DESCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ] },
{ "collectionGroup": "waitlist", "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "offerExpiresAt", "order": "ASCENDING" }
  ] },
{ "collectionGroup": "guests", "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "reconfirmStatus", "order": "ASCENDING" },
    { "fieldPath": "reconfirmDeadline", "order": "ASCENDING" }
  ] }
```

(El primero puede resolverse como `queryScope: "COLLECTION"` si nunca se necesita consultar entre eventos — se deja `COLLECTION_GROUP` porque `sweep-waitlist.mjs` sí necesita barrer todos los eventos a la vez, igual que hacía `sweep-reservations.mjs`.)

---

## 13. Casos borde

| Caso | Comportamiento |
|---|---|
| Dos lugares se liberan al mismo tiempo | Cada liberación dispara su propia cascada (§6.1); la transacción de claim por entrada evita que las dos ofrezcan a la misma persona. En el peor caso, una de las dos no logra ofertar en el instante — el barrido de §6.2 lo corrige en ≤10 min. |
| Dos personas promovidas simultáneamente (dos ofertas confirmadas a la vez) | Cada confirmación de oferta es su propia transacción que revalida `status == 'offered'` antes de crear el `guests` doc — no hay forma de que la misma entrada se promueva dos veces. |
| Invitado cancela mientras está "siendo promovido" | No existe un estado intermedio con un `guests` doc a medio crear — mientras está `'offered'` no hay `guests` doc todavía. Si la persona decide no ir, simplemente deja vencer la oferta o hay un botón "no, gracias" que la pasa a `'declined'` de inmediato (libera antes de las 24h, dispara la cascada al siguiente sin esperar el vencimiento). |
| Organizador promueve manualmente a alguien | Mismo mecanismo transaccional de claim, dirigido a una entrada específica en vez de "la próxima de la fila" — sin condición de carrera adicional. |
| Organizador reduce el límite del evento | Igual que ya documenta `CAPACITY_LIMIT_ARCHITECTURE.md §3`: bajar `capacity` nunca desaloja a nadie ni cancela ofertas activas. Solo dejan de generarse ofertas nuevas hasta que `peopleCount` vuelva a estar por debajo del nuevo límite. |
| Invitado paga mientras está en lista de espera | No aplica — una entrada de `waitlist` no tiene flujo de pago propio (§9). Si quiere pagar por adelantado para "asegurar" su lugar, no hay mecanismo para eso a propósito (ver §9, "pagar para saltar la fila"). |
| Invitado es eliminado (`deleteGuest`) | Ya decrementa `peopleCount` de forma atómica hoy — se agrega un intento de cascada (§6.1) inmediatamente después, best-effort, con el barrido como red de seguridad. |
| Invitado intenta anotarse dos veces en la lista de espera | Mismo riesgo pre-existente que el doble-envío en `EventJoin.tsx` normal (ya señalado como riesgo conocido, no resuelto, en `CAPACITY_LIMIT_ARCHITECTURE.md §11`) — no se resuelve distinto acá; la mitigación recomendada (deshabilitar el botón durante el envío) es la misma para ambos formularios. |
| El evento se cancela | PaseLink no tiene hoy un concepto de "evento cancelado" — fuera de alcance de este RFC, no es un problema que esta feature introduzca. |
| La lista de espera supera los 1.000 invitados | Cada entrada es su propio documento (no un array) — no hay límite de tamaño de documento en juego. `priorityBoost` evita el reordenamiento O(n) (§7.1). El único techo real es el mismo ya documentado para `peopleCount` en `CAPACITY_LIMIT_ARCHITECTURE.md §10` (documento `events/{id}` como punto de escritura concurrente) — se hereda ese techo, no se agrega uno nuevo. |
| Oferta vencida y la persona reclama el lugar igual (llega tarde) | La transacción de confirmación revalida `offerExpiresAt > now` — si ya venció, falla con un error claro ("esta oferta ya venció") en vez de crear el guest doc. La UI (§3.2) ya debería estar mostrando "venció" en ese momento (lectura en vivo del mismo documento), así que este caso es principalmente una defensa contra pestañas viejas/offline, no el camino esperado. |
| El organizador cierra `entryMode` (autorregistro) mientras hay lista de espera activa | `entryMode` solo controla si `EventJoin.tsx` acepta *nuevas* anotaciones — no tiene relación con la fila ya existente. Las ofertas y promociones ya en curso siguen su curso normal; simplemente nadie nuevo puede sumarse a la fila mientras está cerrado. |

---

## 14. Riesgos y techos conocidos

- **Cobertura de notificaciones incompleta** (§10): invitados sin email quedan dependiendo del link guardado. Es el riesgo más real de todo el diseño — vale la pena que lo tengas presente antes de aprobar, no es un detalle menor.
- **Reintroduce cronómetros** después de haber eliminado uno parecido (§1.3) — mitigado por estar acotado a un caso de escasez real, pero es una superficie operativa nueva (otro cron de GitHub Actions para mantener) que hay que aceptar conscientemente.
- **`priorityBoost` puede crecer sin límite** con usos repetidos de "mover al frente" en una fila muy activa — en la práctica (enteros de 64 bits en Firestore) esto no es un problema real hasta después de miles de millones de operaciones, se menciona solo por completitud.
- **`firestore.rules` sigue creciendo** — mismo comentario ya hecho en el RFC de capacidad, se mantiene la disciplina de helpers aislados y nombrados.

---

## 15. Plan de implementación por fases (propuesto, sujeto a §16)

**Fase 0 — en paralelo a la Fase 1, no bloquea su arranque:**
0. Trámite de WhatsApp Business API (§10.4): verificación de negocio en Meta, número dedicado, envío de las 2 plantillas a revisión. Es el único ítem de todo este plan con un tiempo que no controla el desarrollo — conviene iniciarlo ya.

**Fase 1 — Lista de espera sola (sin reconfirmación):**
1. Colección `waitlist` + tipos + reglas + índices.
2. `EventJoin.tsx`: formulario de lista de espera en el estado `'full'`.
3. Página de estado por token (`/waitlist/:eventId/:entryId`).
4. Cascada de oferta inline (§6.1) enganchada en `deleteGuest` y en el rechazo/vencimiento de pago ya existente.
5. `sweep-waitlist.mjs` + workflow de GitHub Actions (§6.2).
6. Pestaña "Lista de espera" en `EventDetail.tsx` con promoción manual, reordenamiento, y asignación directa (§4.2).
7. Tests de concurrencia (mismo estilo que el test `Promise.allSettled` ya existente para capacidad).

**Fase 2 — Reconfirmación:**
8. Campos nuevos en `guests`/`events`, modal de campaña (§4.3), banner en `GuestPass.tsx`.
9. Generalizar `send-rsvp-reminders.mjs` para leer también `reconfirmCampaign.reminderRules`.
10. Liberación automática por vencimiento + gracia (§8.4), enganchada a la misma cascada de oferta de la Fase 1.
11. `scripts/lib/waChannel.mjs` + integración en los envíos de oferta/reconfirmación (§10.5) — requiere que la Fase 0 ya haya resuelto el trámite de Meta.

**Fase 3 — pulido, no bloqueante:**
- Campo email opcional en alta manual (§10.2, sugerencia).
- Ajustar copy/UI según uso real antes de invertir en un log de auditoría dedicado (§4.2).

---

## 16. Qué queda para tu decisión antes de implementar

Estado tras el banner de implementación de arriba: 1, 2 y 4 son específicos de reconfirmación (V2, no construida todavía — siguen abiertos para cuando se retome). 3 quedó resuelto por la implementación de V1. 5 sigue siendo una mejora aparte, no incluida.

1. **§1.2 — Ventana de gracia automática en vez de "el organizador revisa" como paso obligatorio.** Sigue abierto — es parte de reconfirmación, no construida en V1.
2. **§1.3 — Aceptar reintroducir un mecanismo de cronómetro**, acotado a escasez real. Sigue abierto para reconfirmación específicamente — la lista de espera V1 sí usa un cronómetro (la oferta de 24h) y ya se aceptó y construyó, ver el banner de implementación.
3. **§7.3 — Alguien que pierde su oferta no vuelve automáticamente a la fila.** ~~Resuelto — implementado tal cual: una oferta vencida/declinada queda en ese estado, sin reingreso automático; para seguir esperando hay que anotarse de nuevo (nueva entrada, nuevo lugar en la fila real).~~
4. **§4.3 — "Todos los confirmados (incluye pagados)" queda disponible pero desalentado.** Sigue abierto — parte de reconfirmación.
5. **§10.6 — Sugerencia de agregar email opcional al alta manual.** Sigue sin incluirse — sigue siendo una mejora aparte, ahora con más motivo (es el único canal de notificación de la lista de espera V1, WhatsApp quedó sin construir).

~~Canal de notificación primario~~ — resuelto 2026-07-31 como WhatsApp Business API para el diseño completo (V2); **la V1 implementada usa solo email** (ver banner de implementación) porque WhatsApp no se construyó en esta ronda.
