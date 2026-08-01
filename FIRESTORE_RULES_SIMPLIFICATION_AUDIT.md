# Reducción de complejidad de Firestore Security Rules: auditoría y plan por fases

Fecha: 2026-08-01. Alcance: `firestore.rules` (1911 líneas) y su contraparte en `functions/src/`.

## 0. Resumen ejecutivo

`firestore.rules` ya golpeó el límite de 1000 expresiones de Firestore **dos veces en producción** (documentado en los propios comentarios del archivo, líneas 46-54 y 1303-1311): una vez en el auto-registro público de invitados, otra en la rama combinada de check-in + pago. Ambos incidentes ocurrieron en las dos reglas más grandes del archivo — `events/{eventId}` `allow update` (~185 líneas, 10 ramas `||`) y `guests/{guestId}` `allow update` (~165 líneas, 9 ramas `||`) — exactamente donde vive la lógica de negocio que este ticket pide sacar de las reglas.

**La buena noticia: parte de esta migración ya está hecha y en producción.** El commit `cddfd25` ("se migro sistema de check in a cloud functions") movió confirmación de pago, check-in, check-out y reingreso a Cloud Functions (`functions/src/checkin/`, `functions/src/payments/`, `functions/src/callable/`). Las reglas ya reflejan ese cambio: `guests/{guestId}` bloquea esos campos con `accessControlFieldsUntouched()` (línea 686) y `checkins/{checkinId}` ya es `allow create, update: if false` (línea 1485/1487) — el patrón objetivo de este ticket, aplicado y funcionando.

Lo que queda es exactamente lo que predijo `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` §4.2/4.3/5.1 (2026-07-31), sin haber avanzado desde entonces (el archivo pasó de 1907 a 1911 líneas, cambios cosméticos): capacidad/alta de invitados, checkout de concesiones, y el costo estructural de `isAdmin()` repetido en decenas de ramas. Este documento no repite el análisis estratégico de esa auditoría — lo retoma donde quedó, con líneas concretas del archivo actual, un inventario completo de qué migrar, y un orden de fases operativo.

**No se hizo ningún cambio de código en este documento** — es diagnóstico y plan, igual que las auditorías previas del proyecto.

## 1. Qué ya está resuelto (no tocar, ya es el patrón a seguir)

| Módulo | Evidencia en rules | Evidencia en functions/ |
|---|---|---|
| Confirmar pago / check-in / check-out / reingreso | `accessControlFieldsUntouched()` (rules:686-692) bloquea `paymentStatus/paymentMethod/paidAt/paidBy/status/checkedInAt/checkedInBy*/checkedOutAt/checkedOutByEmail/exitType` en toda escritura de cliente | `functions/src/checkin/{checkIn,checkOut,confirmPaymentAndCheckIn}.ts`, `functions/src/payments/confirmPayment.ts`, `functions/src/callable/{setGuestPaymentStatus,bulkSetGuestPaymentStatus,checkInGuest,checkOutGuest,confirmPaymentAndCheckIn,allowGuestReentry}.ts` |
| Doc `checkins/{checkinId}` | `allow create: if false; allow update: if false;` (rules:1485,1487) | Admin SDK, ignora rules |
| Estados de oferta/promoción de lista de espera | `waitlist/{entryId}` `allow update` solo permite `priorityBoost` (subir) y `status: waiting→removed`; todo lo demás (`offerToken`, `promotedGuestId`, `status: offered/promoted/expired/declined`) queda fuera del `hasOnly` (rules:1749-1761) | `functions/src/callable/{confirmWaitlistOffer,declineWaitlistOffer,cancelWaitlistOffer,promoteWaitlistEntry}.ts`, `functions/src/waitlist/{cascade,notify,promote}.ts`, `functions/src/reconfirm/`, `functions/src/scheduled/sweepReconfirmations.ts` |

Este es el patrón que el resto del archivo debe replicar: la Cloud Function vuelve a leer el estado real dentro de una transacción de servidor, y la regla correspondiente se angosta a `if false` o a un `hasOnly` que excluye por completo los campos que ahora son exclusivos del Admin SDK.

## 2. Inventario de lo que queda: lógica de negocio todavía en rules

### 2.1 `events/{eventId}` `allow update` (rules:1096-1267) — el bloque crítico

Es la regla que más veces rompió el techo de expresiones. Sus 10 ramas mezclan autorización (`isOwnerData`/`canDoData`) con aritmética de negocio real:

- **Auto-registro público** (rules:1130-1136): valida que `guestCount`/`peopleCount`/`rsvpYesCount` suban exactamente lo que corresponde, y `attendeeLimitOk()` (rules:182-186) — un chequeo de cupo disponible, no de permisos.
- **Contador de presencia walk-in/walk-out** (rules:1151-1154): `counterDeltaOk()` (rules:165-169) tolera un delta de ±50 sin verificar que corresponda a una entrada/salida real.
- **Alta/baja/edición de invitados por el organizador** (rules:1186-1194, 1209-1218): mismo patrón — contadores movidos "dentro de un rango razonable", nunca recalculados desde la fuente.
- **Autocancelación del invitado** (rules:1250-1252): `guestSelfCancelCountsOk()` (rules:220-236) es 15 líneas de aritmética cruzada entre 7 contadores distintos.
- **RSVP** (rules:1241-1242): `rsvpCountsOk()` (rules:198-204) exige que la suma de 3 contadores se mantenga constante.

**Por qué es negocio, no autorización:** ninguna de estas ramas pregunta "¿quién sos?" — preguntan "¿es correcta esta operación aritmética?". Esa pregunta la puede responder con certeza una transacción de servidor que relee el estado real; las reglas solo pueden acotar el *tamaño* del cambio, nunca confirmar que es *correcto*. Es la misma distinción que ya motivó migrar 4.1.

**Ya identificado y priorizado en `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` §4.2** (roadmap ítems 8 y 12): migrar `registerWalkInGuest` primero (tráfico público, mayor superficie), después consolidar `addGuest`/`addGuestsBulk`/`addGuestsFromRows` en una sola Callable Function que también centraliza el cálculo de cupo (hoy triplicado client-side).

**walk-in/walk-out (Opciones A/C) quedan fuera de esa migración a propósito** (así lo documenta el propio archivo, rules:1140-1143): es un problema de diseño distinto (conteo manual en la puerta sin invitado identificado), no cubierto por 4.2. Se puede dejar para una fase posterior sin bloquear el resto.

### 2.2 Concesiones — catálogo y pedidos (rules:1514-1651)

- `isValidConcessionOrderCreate()` (rules:746-764): valida forma pero **no** que `subtotalMinorUnits`/`totalMinorUnits` coincidan con el precio real del catálogo — el propio comentario del archivo lo admite (rules:737-745).
- `isValidConcessionStockDecrement`/`isValidConcessionSoldCountBump`/`isValidConcessionStockRelease` (rules:777-817): la contabilidad de inventario (descuento en checkout, liberación al cancelar) vive enteramente como aritmética de reglas sobre el documento del ítem del catálogo.

**Ya identificado en `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` §4.3** (roadmap ítem 13): `createConcessionOrder` a Callable Function que recalcula precio/stock desde el catálogo real antes de confirmar. Menor prioridad que 2.1 porque el módulo sigue en fase piloto (`FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md`), pero conviene resolverlo antes de GA — cada evento nuevo que lo activa es más superficie expuesta con el gap ya reconocido.

`concessionsFulfillment` (rules:1597-1651) no maneja dinero (es la proyección de cocina) — su complejidad es de *autorización por rol* (Menu Manager vs organizador vs confirmPayments), no de negocio. **No es candidato a migrar** — es exactamente el tipo de regla que el ticket pide conservar.

### 2.3 `isAdmin()` disperso (más de 20 call sites)

`isAdmin()` (rules:92-95) hace un `exists()` por cada llamada. No es lógica de negocio, pero es el multiplicador de costo que hizo más caro cada incidente de 1000 expresiones — está en casi todas las ramas de `events`, `guests`, `concessionsCatalog`, `concessionsOrders`, `wall`, `photos`, etc. Ya identificado en `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` §3.2/§5.1: mover a custom claims (`request.auth.token.admin == true`) elimina el `get()`/`exists()` de cada una de esas ramas sin cambiar ni una regla de negocio. Es la optimización estructural más barata de esta lista y reduce el costo de *todo* el archivo, no solo un módulo.

### 2.4 Lo que queda en `guests/{guestId}` (rules:1312-1433) — mayormente correcto, revisar solo dos funciones

Después de la migración de check-in/pago (4.1), lo que queda en esta regla es en su mayoría autoservicio del invitado sin cuenta obligatoria (RSVP, auto-edición, reclamo de dispositivo, vínculo de cuenta) — autorizado por conocer un `guestId`/`lockToken`, no por rol. Esto **es** autorización (identidad débil, pero autorización) y no debería migrarse solo para "reducir líneas" — moverlo a Callable Functions cambiaría la UX de escritura instantánea a una llamada de red, sin ganancia de seguridad real (no hay contador de dinero involucrado).

Dos excepciones a revisar en la Fase A (van de la mano con 2.1 porque comparten los mismos contadores del evento):
- `companionsWithinLimitData()` (rules:620-624) y `companionsWithinLimit()` (rules:607-611): la validación de cupo de acompañantes por invitado — mismo tipo de aritmética de negocio que 2.1, aunque vive en un helper separado.
- Nada más en este bloque requiere migrarse.

## 3. Qué debe permanecer en rules sin cambios

Para que quede documentado (pedido explícito del ticket): estos bloques ya son autorización pura y no son candidatos a esta migración —

- `admins`, `feedback`, `feedbackRateLimits`, `reports`, `reportRateLimits`, `reportDedup`, `communityTemplates`, `sanctions`, `adminAuditLog`, `sendBudget`, `users` (rules:835-1081): permisos por rol/propiedad, sin aritmética de negocio.
- `wall`/`photos` y sus subcolecciones `reactions` (rules:1765-1863): `reactionCounterDeltaOk()` acota a ±1 por escritura — es una defensa en profundidad barata, no un cálculo de negocio complejo; migrarlo a Cloud Function agregaría latencia a una interacción social de bajo riesgo (nunca dinero) sin beneficio proporcional.
- `tables` (Seating Chart, rules:1493-1504), `checkins` (rules:1479-1488), `notificationQueue`/`messageCampaigns`/`sendLog` (rules:1657-1723): ya son `if false` para las escrituras sensibles o validaciones de forma acotadas.
- `waitlist` (rules:1731-1763): ver §1 — ya es el ejemplo a seguir.
- `guestContacts` (rules:1443-1477 y 1904-1909): autorización por posesión de link/lock token + la excepción de `collectionGroup` para recuperación entre dispositivos (autorización por email verificado, no negocio).

## 4. Plan de migración por fases

Mismo criterio de secuenciación que ya usó el proyecto para 4.1 (menor superficie primero, camino crítico en vivo al final de cada fase, sin downtime, con compatibilidad de datos).

**Fase A — Capacidad y alta pública de invitados (mayor prioridad).**
1. ✅ **Implementado (2026-08-01), pendiente deployar + narrow de rules.** `registerWalkInGuest` → Callable Function (`functions/src/callable/registerWalkInGuest.ts` + servicio puro `functions/src/capacity/registerWalkInGuest.ts`). Recalcula cupo real (`attendeeLimitEnabled`/`capacity`, incluida la cuenta de ofertas activas de waitlist, ahora leída **dentro de la misma transacción** vía `tx.get(aggregateQuery)`, que el SDK de cliente no podía hacer) y valida longitud de campos de `customData` del lado del servidor (`functions/src/lib/guestValidation.ts`). `guestUid`/`guestPhotoURL` ya no los manda el cliente — la función los resuelve del uid verificado y de `users/{uid}.photoURL`. `src/firebase/capacity.ts` es ahora un wrapper delgado sobre `httpsCallable`. 156 tests en `functions/` (antes 146) + 236 en `test:firebase` (antes ~256, se sacaron los que ahora viven en `functions/src/capacity/registerWalkInGuest.test.ts`) + build/lint/tsc raíz y `functions/` OK. **Falta:** desplegar la función a producción, confirmar que anda, y solo entonces angostar `firestore.rules` (rules:1130-1136 en `events/{eventId}`, rules:1285 en `guests/{guestId}` `allow create`, rules:1460 en `guestContacts/{guestId}` `allow create`, más los helpers `canSelfRegisterGuest`/`isValidPublicGuestRegistrationData` de rules:392-448) — ver §7, ese paso queda deliberadamente para después de confirmar en producción.
2. Consolidar `addGuest`/`addGuestsBulk`/`addGuestsFromRows` en la misma Callable Function (o una hermana que reutilice el mismo cálculo de cupo) — elimina la triplicación ya señalada en `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` §4.2. Cierra las ramas de rules:1186-1218.
3. De paso, mover `companionsWithinLimit`/`companionsWithinLimitData` (§2.4) al mismo cálculo server-side.

Efecto directo: `events/{eventId}` `allow update` pasa de 10 ramas a ~4-5 (co-organizadores, RSVP/autocancelación de invitado sin cuenta, concesiones) — el mismo alivio de expresiones que ya logró 4.1 sobre `guests/{guestId}`.

**Fase B — Checkout de concesiones.**
4. `createConcessionOrder` → Callable Function que recalcula precio/stock desde `concessionsCatalog` real. Cierra `isValidConcessionOrderCreate` + las 3 funciones de contabilidad de stock (§2.2). Menor urgencia que Fase A (módulo en piloto), pero debe cerrarse antes de GA.

**Fase C — Optimización estructural (puede correr en paralelo a A/B, es independiente).**
5. Custom claims para `isAdmin()` (§2.3). No depende de las fases anteriores; reduce el costo de evaluación de todo el archivo de inmediato.

**Fase D — Contadores agregados (deuda técnica relacionada, no bloqueante).**
6. Trigger de reconciliación (`BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` §4.4) para `peopleCount`/`paidCount`/`checkedInCount`/`occupancyCount`/`rsvp*Count` — no reduce rules directamente, pero una vez que Fase A mueve la escritura de estos contadores a Cloud Functions, es el momento natural de agregar el reconciliador y dejar de depender de que cada `increment()` disperso sea correcto.

**No priorizado en este documento:** RSVP/autocancelación/auto-edición del invitado sin cuenta (§2.4), reacciones del muro/fotos (§3) — no representan riesgo de negocio ni de techo de expresiones proporcional al esfuerzo de migrarlos.

## 5. Patrón de reducción de reglas (ejemplo concreto)

Siguiendo exactamente el precedente de `checkins/{checkinId}` (rules:1479-1488):

```
// ANTES (rules, hoy) — events/{eventId} allow update, rama de auto-registro:
|| (resource.data.entryMode in ['open', 'hybrid']
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['guestCount', 'peopleCount', 'rsvpYesCount'])
    && request.resource.data.guestCount == eventGuestCountBefore(resource.data) + 1
    && request.resource.data.peopleCount >= eventPeopleCountBefore(resource.data) + 1
    && request.resource.data.peopleCount <= eventPeopleCountBefore(resource.data) + 21
    && request.resource.data.get('rsvpYesCount', 0) == resource.data.get('rsvpYesCount', 0) + 1
    && attendeeLimitOk(resource.data, request.resource.data))

// DESPUÉS (rules, objetivo) — la Callable Function (Admin SDK) escribe estos
// campos directo, ignorando las reglas; el cliente ya no tiene ninguna vía:
&& !request.resource.data.diff(resource.data).affectedKeys()
      .hasAny(['guestCount', 'peopleCount', 'rsvpYesCount', 'rsvpNoCount', 'rsvpPendingCount'])
```

Y del lado de `guests/{guestId}` `allow create`, la rama pública (rules:1283-1285) se reemplaza por `allow create: if false` para el caso anónimo, dejando solo `canDo(...,'addGuests',...)` para el alta manual del organizador (que también migra en Fase A, pero puede hacerlo en un segundo commit sin bloquear el primero).

## 6. Plan de pruebas

El proyecto ya tiene la infraestructura correcta para esto (`npm run test:firebase`, emulador de Firestore + `vitest.firebase.config.ts`) y la migración de 4.1 ya demostró el patrón de traspaso: los tests que hoy verifican *reglas* pasan a verificar *la Callable Function con Admin SDK*, y las reglas retienen solo un test que confirma el `if false`/`hasOnly` angosto.

| Test actual (rules, `src/firebase/__tests__/`) | Qué cubre hoy | Destino tras la migración |
|---|---|---|
| `attendeeLimit.test.ts` | `attendeeLimitOk`, cupo vía rules | Mueve la mayoría de casos a `functions/src/__tests__/` (o carpeta nueva del Callable); rules conserva 1-2 tests de "cliente no puede escribir estos campos directo" |
| `capacity.test.ts` | `registerWalkInGuest`, `walkIn`/`walkOut` transaccional | Se separa: casos de alta pública → tests de la nueva Callable; `walkIn`/`walkOut` (fuera de alcance, §2.1) permanecen igual |
| `concessions.rules.test.ts` | Checkout, stock, catálogo | Casos de dinero/stock → tests de la nueva Callable; catálogo/fulfillment (autorización por rol) permanecen como test de rules |
| `guests.test.ts`, `guestSelfCancel.rules.test.ts`, `guestOwnership.rules.test.ts`, `events.rules.test.ts` | Ya reflejan la migración de 4.1 (`accessControlFieldsUntouched`) | Sin cambios en Fase A/B — agregar casos que confirmen que las nuevas ramas cerradas (`hasAny`) rechazan al cliente |
| `waitlist.test.ts` | Ya es el patrón correcto | Sin cambios — referencia de cómo debería verse el resto |

Regla general para todas las fases: **la Cloud Function se escribe y testea contra el emulador primero (`test:functions` si existe, o su equivalente), se deploya, se verifica en producción con el camino de cliente todavía abierto, y solo entonces se angosta la regla correspondiente** — mismo orden que documentan los comentarios ya presentes en el archivo para 4.1 (rules:676-684). Nunca angostar la regla antes de que la función esté sirviendo tráfico real.

## 7. Riesgos y compatibilidad sin interrupción de servicio

- **Sin cambios de esquema de datos** en ninguna fase — igual que 4.1, la migración cambia *quién* tiene permiso de escribir un campo, no la forma del documento. No requiere backfill.
- **Orden de deploy dentro de cada fase:** Cloud Function → verificar en producción con la regla vieja todavía activa (doble camino temporalmente posible) → angostar la regla → eliminar el código cliente que ya no se usa. Nunca al revés.
- **Fase A es la de mayor riesgo real** porque toca `registerWalkInGuest`, tráfico público no autenticado — mismo mitigante que recomienda `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md` para el escáner: cuidar cold starts (`minInstances`) si el volumen de auto-registro simultáneo lo justifica (llegada masiva a la puerta de un evento grande).
- **Fase B (concesiones) es de bajo riesgo** — módulo en piloto, sin eventos reales a gran escala usándolo todavía según `FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md`.
- **Fase C (custom claims) es la de menor riesgo de todo el plan** — cambia cómo se verifica una identidad ya validada por un documento (`/admins/{uid}`), no agrega ninguna superficie nueva. Puede ejecutarse en cualquier momento sin depender de las otras fases.

## 8. Métrica de éxito

- **Expresiones evaluadas:** el objetivo no es un número absoluto sino márgen sobre el techo de 1000 — hoy `events/{eventId}` `allow update` y `guests/{guestId}` `allow update` ya lo tocaron dos veces con el volumen actual del proyecto. Tras la Fase A, la rama de auto-registro (la que causó uno de los dos incidentes) deja de evaluarse contra reglas — pasa a ser una sola condición `hasAny(...)` negada.
- **Líneas de `firestore.rules`:** Fase A elimina ~120 líneas entre `events/{eventId}` (rules:1130-1218) y los helpers de rules:360-448/607-624; Fase B elimina ~110 líneas entre rules:746-817. Meta razonable: el archivo baja de 1911 a ~1650-1700 líneas sin perder ningún permiso legítimo.
- **Documentación viva:** este documento (§2 y §3) es la referencia de "qué quedó en rules y por qué" que pide el ticket — actualizarlo al cerrar cada fase, no crear uno nuevo por fase.
