# RFC: Límite máximo de asistentes en eventos con autorregistro

**Estado:** Propuesta — sin implementar.
**Autor:** Diseño asistido (Claude) a pedido del admin de PaseLink.
**Fecha:** 2026-07-31.
**Motivo:** el evento "Baile Improvisado" fue creado para ~200 invitados y acumuló 208 registros porque el autorregistro nunca deja de aceptar gente. Este documento diseña un límite duro, opcional, seguro ante condiciones de carrera, y compatible con todos los eventos existentes.

---

## 0. Resumen ejecutivo

| Aspecto | Decisión |
|---|---|
| Campo nuevo en `EventData` | Uno solo: `attendeeLimitEnabled?: boolean`. Ningún campo numérico nuevo. |
| Número de cupo | Se reutiliza `capacity` (ya existe, ya es obligatorio, ya tiene UI). Ver §1.2 para el porqué y el costo de esta decisión. |
| Contador de ocupación | Se reutiliza `peopleCount` (ya existe, ya se mantiene de forma atómica en cada alta/baja de invitado). **Cero contadores nuevos, cero backfill.** |
| Colecciones nuevas | Ninguna. |
| Cloud Functions | Cero (el proyecto no las usa — plan Spark, confirmado en `firebase.json`). Todo se resuelve con `runTransaction` en cliente + Security Rules, igual que `paidCount` y que el descuento de stock de Concessions. |
| Mecanismo anti-carrera | Transacción Firestore que lee `peopleCount`/`capacity` y escribe la creación del invitado en la misma operación atómica — exactamente el patrón ya probado en `createConcessionOrder` (`src/firebase/concessions.ts:255-327`) para no vender de más el último producto en stock. |
| Compatibilidad con eventos actuales | Total. `attendeeLimitEnabled` ausente/`false` ⇒ comportamiento bit-a-bit idéntico al actual. No hay migración de datos porque `peopleCount` y `capacity` ya existen y ya están correctos en todos los eventos. |
| Lista de espera | No se implementa ahora. Se documenta el punto de extensión (§13) para que se pueda agregar después sin tocar el modelo de datos de esta fase. |
| Alcance recomendado de la Fase 1 | Bloquear autorregistro + alta manual/CSV usando `peopleCount` tal cual existe hoy. La precisión fina sobre invitados que declinan su RSVP sin ser eliminados queda para la Fase 2 (§14) — no bloquea resolver el incidente reportado. |

---

## 1. Qué ya existe y por qué no se puede simplemente "activar"

### 1.1 `capacity` ya existe, pero es deliberadamente decorativo

`EventData.capacity: number` (`src/types/index.ts:339`) es un campo obligatorio (default `'100'` en `EventCreate.tsx`) que hoy **nunca bloquea nada**. Esto está confirmado y documentado en tres lugares distintos del código, no es un descuido:

- Comentario en `src/firebase/capacity.ts:62-64`: *"`capacity` es puramente informativo... no un límite duro"*.
- Copy visible al organizador en `StepInvitationMethod.tsx:123-126`: *"Es una capacidad recomendada, no un límite estricto: si se supera, los nuevos invitados igual pueden registrarse."*
- Un test dedicado (`capacity.test.ts`) que afirma explícitamente que el registro nunca se bloquea por cupo.

La función que crea invitados por autorregistro, `registerWalkInGuest` (`src/firebase/capacity.ts:84-194`), ni siquiera lee `capacity` dentro de su transacción. Por eso "Baile Improvisado" llegó a 208/200: el sistema hizo exactamente lo que está diseñado para hacer hoy.

El único lugar donde `capacity` sí actúa como tope duro es en `walkIn()`/`walkOut()`, y es para un concepto distinto: ocupación física en la puerta (`occupancyCount`, gente que ya entró vs. ya salió), no cupo de registro.

### 1.2 Decisión: reutilizar `capacity` como el número, agregar solo el interruptor

Había dos caminos:

- **(A) Reutilizar `capacity`** como el número que se hace cumplir cuando el organizador activa el límite, y agregar únicamente `attendeeLimitEnabled: boolean`.
- **(B) Campo nuevo** (`attendeeLimit?: number`) totalmente separado de `capacity`, dejando `capacity` intacto como hint informativo.

**Se recomienda (A).** Razones:

1. El pedido explícito es simplicidad ("nada más", "no quiero configuraciones complicadas"). Mostrarle al organizador dos números que se llaman parecido ("Capacidad" y "Capacidad máxima") en la misma pantalla es confuso y es exactamente la clase de fricción que se pidió evitar.
2. Cada evento ya tiene un valor de `capacity` razonable (no hay estado vacío que resolver).
3. Es coherente con lo que el organizador ya escribió ahí: si puso "200", su intención siempre fue "el evento es para 200 personas". Lo único que falta es la opción de que ese número se **cumpla** en vez de ser solo un consejo.

**Costo de esta decisión:** hay que actualizar el comentario de `capacity.ts:62-64`, el copy de `StepInvitationMethod.tsx:123-126` y reescribir el test que hoy afirma "nunca bloquea" para que cubra ambos modos (activado / desactivado). Se documenta como tarea explícita de la Fase 1 (§14), no un efecto secundario silencioso.

### 1.3 El patrón de concurrencia a copiar ya existe en el código: Concessions

El proyecto ya resuelve un problema idéntico (no vender más stock del que hay) en `createConcessionOrder` (`src/firebase/concessions.ts:255-327`): lee el stock **dentro** de un `runTransaction`, lanza un error tipado si no alcanza, y descuenta en la misma transacción que crea el pedido. Es el mismo problema matemático que "no dejar pasar al invitado 201 de un evento con cupo 200", solo que con "invitado" en vez de "producto". Esta RFC no inventa un mecanismo nuevo, adapta uno que ya está en producción.

Lo que el proyecto **no** tiene y por eso no es una opción es un contador denormalizado ya listo llamado "asistentes que ocupan un lugar" — el candidato más cercano y correcto es `peopleCount`, analizado en §5.

---

## 2. Diseño UX

### 2.1 Configuración del organizador

Se agrega, junto al campo de capacidad ya existente (`StepInvitationMethod.tsx` en creación, `EditEventForm.tsx:797` "Modo de ingreso y cupo" en edición):

```
Capacidad máxima          [ 200 ]  ← campo ya existente, sin cambios

☐ Limitar número de asistentes
   Cuando el evento llegue a esta capacidad, el
   autorregistro y las altas manuales se bloquean
   automáticamente.
```

Estados:

- **Desactivado (default, así quedan todos los eventos existentes):** el campo `capacity` se sigue mostrando y editando exactamente igual que hoy, como sugerencia. Cero cambios de comportamiento.
- **Activado:** aparece el texto de ayuda de arriba. No aparece un segundo número — el mismo campo `capacity` pasa a ser el límite real. Si el organizador no había puesto un valor pensado (dejó el default), se sugiere un chequeo suave: al activar el checkbox, si `capacity` está en su valor por defecto, se resalta el campo para invitar a revisarlo antes de guardar (no bloqueante, solo una señal visual).

No se pide un flujo de confirmación adicional ni un modal — es un checkbox y un guardado, coherente con el resto de `EditEventForm.tsx`.

### 2.2 Lo que ve el invitado

**Caso normal (hay lugar):** el formulario de `EventJoin.tsx` se ve exactamente igual que hoy.

**Caso lleno:** en vez del formulario, una pantalla de estado (mismo lugar donde hoy se muestra el aviso suave de capacidad, `EventJoin.tsx:435-446`, pero como bloqueo real, no como nota):

```
🎟️  Este evento ya alcanzó el número máximo de asistentes.

     Cupo completo · Registro cerrado

     Si ya tenés una invitación, buscala en tu correo o
     WhatsApp. Si creés que esto es un error, contactá
     al organizador.
```

Nunca un error técnico, ni siquiera si la carrera de concurrencia lo agarra justo en el peor momento: si el invitado alcanza a enviar el formulario y pierde la carrera por el último lugar (ver §7), la transacción falla con un error tipado (`CapacityFullError`) que el `catch` de `EventJoin.tsx` traduce a esta misma pantalla, nunca a un toast de "algo salió mal".

### 2.3 Dashboard del organizador

`EventDetail.tsx` y `Reports.tsx` ya leen `event.peopleCount`/`event.guestCount` directo del documento (líneas ~122-128 y ~60 respectivamente, ya son la fuente de verdad hoy, sin `onSnapshot` contando documentos uno por uno). Se agrega una tarjeta que reutiliza el componente `StatCard` ya unificado:

```
┌─────────────────────────────┐
│  185 / 200 asistentes        │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  92%    │
│  Cupos disponibles: 15       │
└─────────────────────────────┘
```

Cuando `peopleCount >= capacity` (con el límite activado):

```
┌─────────────────────────────┐
│  🔴 Evento lleno             │
│  200 / 200 asistentes        │
└─────────────────────────────┘
```

Si el límite está desactivado, esta tarjeta no se muestra (se mantiene el conteo simple que ya existe hoy). Esto responde también a "no quiero afectar a quienes prefieran capacidad ilimitada": la tarjeta nueva es 100% opt-in visualmente, no solo funcionalmente.

---

## 3. Flujo completo del organizador

```
Crear/editar evento
  └─ activa "Limitar número de asistentes", capacity = 200
       └─ guarda → attendeeLimitEnabled: true persiste en events/{id}

Mientras el evento recibe registros:
  └─ dashboard muestra 185/200 · 92% · 15 disponibles, en vivo (mismo listener que ya existe)

Aumentar el límite (200 → 250, con 200 ya registrados):
  └─ edita capacity a 250 → guarda
       └─ próxima transacción de registro lee capacity=250, remaining=50 → se reabre el autorregistro
           sin ninguna acción adicional, sin reprocesar nada

Disminuir el límite (250 → 180, con 220 ya registrados):
  └─ edita capacity a 180 → guarda (se PERMITE guardar, no se bloquea el ahorro)
       └─ UI muestra de inmediato: "220 / 180 · por encima del límite"
           con una nota: "No se eliminará a nadie automáticamente. El autorregistro
           permanece cerrado hasta que el número de asistentes baje de 180 por
           cancelaciones o bajas que hagas vos mismo."
       └─ próxima transacción de registro: remaining = max(0, 180 - 220) = 0 → bloqueada
```

**Por qué se permite guardar un límite inconsistente con lo ya registrado:** bloquear el guardado (ej. "no podés bajar de 220") le quita al organizador la única herramienta que necesita en el momento exacto en que la necesita — frenar la sangría ya mismo. La alternativa de eliminar gente automáticamente para "cuadrar" el número sería mucho peor (borra invitaciones reales sin consentimiento del organizador). Se prefiere: guardar siempre, cerrar el registro de inmediato, dejar el ajuste de la lista (si lo hay) como una decisión manual y visible del organizador, nunca automática.

---

## 4. Flujo del invitado

```
Abre el link de autorregistro
  └─ EventJoin.tsx lee event.peopleCount / event.capacity / event.attendeeLimitEnabled
       ├─ hay lugar → formulario normal
       └─ no hay lugar → pantalla "evento lleno" (§2.2), el formulario ni se renderiza

Completa el formulario y envía (solo si había lugar al cargar la página)
  └─ registerWalkInGuest() abre runTransaction
       ├─ relee peopleCount/capacity DENTRO de la transacción (dato fresco, no el de cuando cargó la página)
       ├─ hay lugar → crea el guest + incrementa peopleCount, todo en el mismo commit → éxito
       └─ ya no hay lugar (alguien lo tomó mientras completaba el formulario)
            → la transacción no escribe nada, lanza CapacityFullError
            → EventJoin.tsx atrapa ese error puntual y muestra la pantalla "evento lleno",
              nunca un toast genérico de error
```

El punto clave: la verificación que importa de verdad ocurre **al enviar**, dentro de la transacción, no al cargar la página. La verificación "al cargar la página" es solo una optimización de UX (evitar mostrarle el formulario a alguien que probablemente no lo va a poder completar), nunca la fuente de la garantía de no exceder el cupo.

---

## 5. Modelo de datos: qué invitado ocupa un lugar

Este proyecto no tiene los estados genéricos que se mencionan en el pedido ("confirmado/pendiente/cancelado/eliminado/rechazado") tal cual — tiene su propio modelo (`src/types/index.ts`), y hay que mapear con cuidado:

| Estado real en PaseLink | Campo | ¿Ocupa un lugar? | Por qué |
|---|---|---|---|
| Invitado creado por autorregistro | `rsvpStatus: 'yes'` (siempre, `registerWalkInGuest` lo fija así) | **Sí** | Es exactamente el caso que hay que limitar. |
| Invitado agregado manualmente, sin responder aún | `rsvpStatus: 'pending'` | **Sí** | El organizador lo invitó con la intención de que venga; si no contara, alcanzaría con invitar manualmente para saltarse cualquier límite, y eso rompe la consistencia que se pide en la sección de "invitados agregados manualmente". |
| Invitado que respondió que no va a asistir | `rsvpStatus: 'no'` | **No debería, pero en la Fase 1 sí cuenta** (limitación documentada, ver §5.1) | Declinar debería liberar el lugar. Hoy `peopleCount` no se decrementa al declinar (solo al eliminar), así que la Fase 1 hereda esa imprecisión. Se corrige en Fase 2. |
| Invitado eliminado por el organizador | El documento deja de existir (`deleteGuest`, hard delete) | **No** | `deleteGuest`/`bulkDeleteGuests` ya decrementan `peopleCount` de forma atómica hoy (`src/firebase/guests.ts:440-464`). El lugar se libera de inmediato, sin cambios necesarios. |
| Invitado que se autocancela ("Cancelar mi asistencia") | Mismo `deleteGuest`, hard delete, disparado por el propio invitado | **No** | Mismo mecanismo que arriba — ya funciona. |
| Check-in en la puerta | `status: 'checked_in'` | Ya contaba desde antes (no cambia nada) | El check-in no crea ni destruye el guest doc, solo cambia su estado de asistencia física. |

No existe en este proyecto un estado "rechazado" separado ni un soft-delete/papelera — importante para no diseñar sobre un modelo que no está.

### 5.1 Por qué la imprecisión de `rsvpStatus: 'no'` es aceptable en la Fase 1

El caso reportado ("Baile Improvisado", 208/200) es 100% autorregistro, que siempre entra como `'yes'` — nunca pasa por `'no'`. La ambigüedad de "un invitado agregado a mano que declina sigue ocupando su lugar" es real, pero:

- Es una situación que ya existía antes de esta feature (afecta el conteo mostrado en pantalla hoy, no solo el bloqueo nuevo).
- El organizador tiene una salida manual inmediata: eliminar a quien declinó (ya libera el lugar, mecanismo existente).
- Corregirla de raíz (decrementar `peopleCount` también al declinar) es una mejora general de precisión de las estadísticas del evento, no algo exclusivo de esta feature — se propone como Fase 2 (§14) para no demorar el fix del incidente real.

---

## 6. Arquitectura Firestore

**Sin colecciones nuevas.** Todo sigue viviendo en `events/{eventId}` y `events/{eventId}/guests/{guestId}`, igual que hoy.

**Sin índices nuevos.** `guests` es subcolección de `events/{eventId}`; el gate de capacidad se resuelve leyendo un único documento (`events/{eventId}`) dentro de la transacción, no con una query. `firestore.indexes.json` no necesita tocarse.

**Campo nuevo:**

```ts
// src/types/index.ts, dentro de EventData
attendeeLimitEnabled?: boolean   // default ausente = false = comportamiento actual
```

**Sin contador nuevo.** `peopleCount` ya es exactamente "cantidad de personas (invitado + acompañantes) que tienen un lugar reservado hoy", mantenido de forma atómica en:

- `registerWalkInGuest` (autorregistro) — `capacity.ts`
- `addGuest`, `addGuestsBulk`, `addGuestsFromRows` (alta manual/masiva/CSV) — `guests.ts`
- `deleteGuest`, `bulkDeleteGuests` (bajas) — `guests.ts`
- `updateGuest` (edición de cantidad de acompañantes) — `guests.ts:323`

Reutilizarlo evita exactamente el problema que sí tuvo que resolverse para `paidCount`: no hace falta ningún script de backfill (`scripts/backfill-paid-count.mjs` fue necesario porque `paidCount` era un contador nuevo con historia previa sin poblar; `peopleCount` ya está poblado y correcto en todos los eventos existentes desde antes de esta feature).

---

## 7. Estrategia de concurrencia

### 7.1 El problema exacto a resolver

Cupo = 200, `peopleCount` = 199 (queda 1 lugar). Dos personas envían el formulario en el mismo instante. Se requiere que exactamente una tenga éxito y la otra reciba el mensaje de "evento lleno" — nunca 201/200, nunca las dos bloqueadas si en verdad había 1 lugar.

### 7.2 Solución: todo dentro de una única `runTransaction`

```ts
// src/firebase/capacity.ts — dentro de registerWalkInGuest, adaptando
// el patrón ya probado en createConcessionOrder (concessions.ts:255-327)

return runTransaction(db, async (tx) => {
  const snap = await tx.get(eventRef)
  const event = snap.data()

  if (event.attendeeLimitEnabled) {
    const remaining = Math.max(0, (event.capacity ?? 0) - (event.peopleCount ?? 0))
    if (partySize > remaining) {
      throw new CapacityFullError()   // no se escribe NADA, la transacción aborta
    }
  }

  const guestRef = doc(collection(db, 'events', eventId, 'guests'))
  tx.set(guestRef, { name, qrToken, status: 'invited', rsvpStatus: 'yes', ... })
  tx.update(eventRef, {
    guestCount: increment(1),
    peopleCount: increment(partySize),
    rsvpYesCount: increment(1),
  })
  return { status: 'success', qrToken }
})
```

### 7.3 Por qué esto es suficiente y no hace falta nada más (sin locks, sin colas, sin Cloud Functions)

Firestore usa **concurrencia optimista con reintento automático** para transacciones: si dos `runTransaction` leen el mismo documento (`events/{eventId}`) y ambas intentan escribirlo, el servidor detecta el conflicto en la que llega segunda al commit y el SDK la **reintenta automáticamente desde cero** (vuelve a leer el estado ya actualizado). Con 1 lugar y 2 intentos simultáneos:

1. Ambas transacciones leen `peopleCount = 199` "al mismo tiempo" (desde su óptica local).
2. La transacción A hace commit primero: `peopleCount` pasa a 200.
3. La transacción B intenta hacer commit con la misma versión leída → el servidor la rechaza por conflicto de versión → el SDK la reintenta.
4. En el reintento, B vuelve a ejecutar toda la función: relee `peopleCount = 200`, `remaining = 0`, `partySize (1) > remaining (0)` → lanza `CapacityFullError` → no escribe nada.

Resultado garantizado: 200/200, nunca 201/200. Este es el mismo mecanismo, sin ninguna diferencia conceptual, que ya está corriendo en producción para el stock de Concessions — no es una técnica nueva para este proyecto, es la reutilización de un patrón ya validado.

**Por qué no hacen falta Cloud Functions:** el proyecto no las tiene (confirmado: no hay carpeta `functions/`, `firebase.json` no declara la sección `functions`) y no las necesita para esto — la garantía de atomicidad la da el propio Firestore a nivel de transacción de cliente, no un servidor intermedio. Introducir una Cloud Function acá sería complejidad y costo (plan Blaze) sin ningún beneficio de correctitud adicional.

### 7.4 Security Rules como segunda capa (no la primera)

La transacción es la garantía real. Las Security Rules son la red de seguridad para el caso "alguien evita el cliente oficial y escribe directo a Firestore" (cliente modificado, ataque, bug futuro). Se agrega un helper nuevo, con el mismo estilo que `counterDeltaOk()` (`firestore.rules:165-169`):

```
function attendeeLimitOk(before, after) {
  return !(before.attendeeLimitEnabled == true)
      || after.peopleCount <= after.capacity
      || after.peopleCount <= before.peopleCount   // las bajas siempre están permitidas
}
```

Se agrega como condición adicional (`&&`) en las ramas de `events/{eventId}` que hoy permiten incrementar `peopleCount`:

- Rama de autorregistro público, `firestore.rules:994-999`.
- Rama de alta manual del organizador/coorganizador con `addGuests`, `firestore.rules:1044-1051`.

No se toca la rama de `delete`/baja (`firestore.rules:1151-1152`) ni ninguna rama que solo decrementa contadores — bajar `peopleCount` nunca debe bloquearse.

---

## 8. Alta manual y CSV: comportamiento consistente con el autorregistro

Caso del pedido: quedan 2 lugares, el organizador intenta agregar 5 invitados manualmente.

**Comportamiento elegido: "llenar lo que entra + reportar".** No es todo-o-nada. Se agregan los primeros 2 (en el orden en que aparecen en la lista/CSV) y se informa con claridad:

```
Se agregaron 2 de 5 invitados.
El evento alcanzó su capacidad máxima (200/200).
No se pudieron agregar: Carla Ruiz, Martín Paz, Sofía Ibarra.

[ Aumentar el cupo ]   [ Ver lista completa ]
```

Se prefiere esto por sobre rechazar el lote completo porque desperdiciar lugares reales disponibles (no agregar a nadie cuando sí había espacio para 2) es peor experiencia que una carga parcial bien explicada.

**Mecánica:** `addGuest` (individual) usa la misma transacción de §7.2. `addGuestsBulk`/`addGuestsFromRows` (masivo/CSV) ya procesan en chunks de 50 (`BULK_CHUNK_SIZE`, `guests.ts:192`) de forma secuencial, no en paralelo. Se agrega el mismo chequeo al inicio de cada chunk: si el chunk completo no entra, se agrega solo lo que entra dentro del chunk y se detiene ahí (no se sigue con el resto de chunks) — evita seguir "gastando" lecturas cuando ya se sabe que no queda lugar.

---

## 9. Casos borde

| Caso | Comportamiento |
|---|---|
| Dos personas se registran al mismo tiempo, queda 1 lugar | Garantizado por transacción (§7.3): exactamente una tiene éxito. |
| Alguien abandona el formulario a la mitad | No pasa nada — no existe un paso de "reserva temporal" en este proyecto (fue removido deliberadamente, ver historial de "Eliminación de hold/reserva de pago"). Nada se escribe hasta el envío final, así que no hay lugar "fantasma" que liberar. |
| Invitado eliminado por el organizador | `deleteGuest` ya decrementa `peopleCount` de forma atómica hoy — el lugar se libera al instante, sin cambios necesarios. |
| El organizador cambia el límite mientras hay registros activos | Cada transacción lee el valor de `capacity`/`attendeeLimitEnabled` vigente en ese momento (lectura fuerte de Firestore, no cacheada) — el cambio aplica desde el próximo intento de registro, sin ventana de inconsistencia. |
| Registros duplicados (doble clic, doble envío) | No es un problema nuevo de esta feature, pero cada envío exitoso consume un lugar igual. Se recomienda (fuera de alcance de este RFC, señalado como riesgo en §11) verificar que el botón de envío de `EventJoin.tsx` se deshabilite mientras la transacción está en curso. |
| Múltiples pestañas abiertas (mismo invitado o mismo organizador) | Ambas pestañas convergen al mismo estado real tras cualquier escritura (listener en vivo ya existente sobre el documento del evento). La transacción evita que dos pestañas "gasten" el mismo último lugar aunque ambas muestren un número stale por un instante. |
| Reconexión después de estar offline | El SDK de Firestore encola la transacción y la reintenta contra el servidor recién al reconectar — nunca se resuelve contra una caché local desactualizada. Si para ese momento el evento ya se llenó, la transacción falla igual que cualquier otro intento tardío; se recomienda un estado de UI claro ("sin conexión, tu registro se enviará cuando vuelvas a tener señal") para que ese fallo no se sienta como un bug. |
| Restauración de registros eliminados | No existe hoy papelera/soft-delete (`deleteGuest` es hard delete). Si en el futuro se agrega una, su acción de "restaurar" debe pasar por la misma transacción de §7.2 (no puede saltarse el chequeo de cupo). Se deja como nota para no romper esta garantía si esa feature se construye después. |
| Importación masiva (CSV) | Ver §8: se llena lo que entra por chunk y se detiene, con reporte claro de cuántos quedaron afuera. |
| Eventos con cupo ilimitado | `attendeeLimitEnabled` ausente/`false` → la transacción ni siquiera evalúa `remaining`, es un `if` que se saltea — mismo camino de código, mismo costo, que hoy. |
| Organizador baja el límite por debajo de lo ya registrado | Se permite guardar (§3). El registro nuevo queda bloqueado de inmediato; nadie es eliminado automáticamente. |
| Organizador pone el límite en 0 con el toggle activado | Se permite (equivale a "cerrar el registro ya"), pero es una herramienta distinta de `entryMode` (que ya existe para abrir/cerrar el autorregistro por completo). Se documenta la diferencia en el copy para no confundir ambos mecanismos. |

---

## 10. Riesgos técnicos

- **Cambio de contrato de `capacity`.** Deja de ser "siempre informativo" para ser "informativo o duro según un flag". Requiere actualizar el comentario de `capacity.ts:62-64`, el copy de `StepInvitationMethod.tsx:123-126` y el test que hoy afirma lo contrario. Riesgo bajo, pero es un cambio de semántica de un campo ya usado en varios lugares — se listan explícitamente como tareas de la Fase 1, no como efecto colateral silencioso.
- **Imprecisión de `rsvpStatus: 'no'` en la Fase 1** (§5.1): un invitado agregado a mano que declina sigue "ocupando" un lugar hasta que el organizador lo elimina. Mitigación inmediata: eliminación manual (ya existe). Corrección de raíz: Fase 2.
- **Doble envío / falta de idempotencia en el formulario público.** No es nuevo de esta feature, pero con un cupo finito cada envío duplicado exitoso "gasta" un lugar real. Vale la pena confirmar (auditoría corta, no incluida en el alcance de este RFC) que `EventJoin.tsx` deshabilita el botón mientras la transacción está en curso.
- **`firestore.rules` ya es un archivo grande y denso** (~107 KB). Agregar `attendeeLimitOk()` como helper aislado, con el mismo estilo que `counterDeltaOk()`, mantiene el diff acotado y revisable, pero cada regla nueva suma a la carga cognitiva de mantenimiento general del archivo — no es un riesgo de esta feature en particular, pero vale nombrarlo.
- **Escala de un único documento "caliente".** El chequeo y el incremento viven en el mismo documento `events/{eventId}` que ya concentra `guestCount`, `peopleCount`, `paidCount`, etc. Para el volumen real de este producto (decenas o cientos de registros por evento, no miles por segundo) esto es exactamente lo que Firestore está diseñado para soportar con transacciones y reintentos automáticos. Si en el futuro un evento esperara ráfagas sostenidas de más de ~1 escritura/segundo sobre el mismo documento (escala muy por encima de lo que este producto maneja hoy), la solución estándar sería un contador *sharded* — se documenta como techo conocido, no como algo a construir ahora.

---

## 11. Compatibilidad con eventos existentes

- Todo evento ya creado tiene `attendeeLimitEnabled` ausente → se evalúa como `false` → comportamiento idéntico al actual, sin excepciones.
- `capacity` y `peopleCount` ya existen y ya están correctamente poblados en todos los eventos — no hace falta ningún script de backfill (a diferencia de `paidCount`, que sí lo necesitó por ser un contador genuinamente nuevo).
- Nadie que prefiera cupo ilimitado ve ningún cambio: ni en el formulario de creación (el checkbox nuevo empieza destildado), ni en el dashboard (la tarjeta de cupo no aparece si el límite no está activado), ni en el costo de la transacción (el chequeo se saltea con un solo `if`).

---

## 12. Lista de espera — arquitectura preparada, sin implementar

No se construye ahora. El modelo se diseña para que agregarla después no requiera migrar nada de lo hecho en esta fase:

- Subcolección nueva y separada, `events/{eventId}/waitlist/{entryId}` — nunca mezclada con `guests`. Esto mantiene el invariante "todo documento en `guests` tiene un lugar confirmado", que es justamente lo que hace simple el conteo de `peopleCount` en esta fase (nunca hay que filtrar entradas de lista de espera al calcular ocupación).
- Forma prevista de una entrada futura: `{ name, contacto, partySize, createdAt, status: 'waiting' | 'promoted' | 'declined' | 'expired', promotedGuestId? }` — deliberadamente parecida a los datos mínimos de un `guests` doc, para que "promover" sea básicamente copiar estos campos a un `guests` doc nuevo dentro de una transacción (mismo mecanismo de §7.2, reutilizado).
- Promoción: como el proyecto no usa Cloud Functions, el camino más simple es un botón manual del organizador ("Promover siguiente de la lista") en vez de un trigger automático — o, si se quiere automatizar, seguir el patrón ya existente de cron por GitHub Actions (`send-notifications.yml`, `rsvp-reminders.yml`) para notificar al siguiente de la lista cuando se libera un lugar, sin necesidad de infraestructura nueva.
- La pantalla de "evento lleno" (§2.2) ya queda como el punto de inserción natural para un futuro botón "Unirme a la lista de espera" — no hace falta rediseñar `EventJoin.tsx` cuando llegue el momento.

---

## 13. Plan de implementación por fases

**Fase 1 — MVP, resuelve el incidente reportado:**
1. Actualizar comentario de `capacity.ts:62-64`, copy de `StepInvitationMethod.tsx:123-126`, y el test que afirma "nunca bloquea" (§1.2).
2. Agregar `attendeeLimitEnabled?: boolean` a `EventData`.
3. Checkbox en `StepInvitationMethod.tsx` (creación) y `EditEventForm.tsx:797` (edición).
4. Gate transaccional en `registerWalkInGuest` (`capacity.ts`) — §7.2.
5. Gate transaccional en `addGuest`/`addGuestsBulk`/`addGuestsFromRows` (`guests.ts`) con comportamiento "llenar lo que entra + reportar" (§8).
6. Helper `attendeeLimitOk()` en `firestore.rules`, insertado en las ramas de §7.4.
7. Pantalla "evento lleno" en `EventJoin.tsx`, con manejo del error tipado de la transacción.
8. Tarjeta de cupo + alerta "Evento lleno" en `EventDetail.tsx`/`Reports.tsx` (`StatCard`).
9. Tests: unitarios del gate (lleno / exacto / con margen / desactivado) + tests de reglas con emulador, siguiendo el mismo patrón que ya existe para `paidCount`/Concessions.
10. Deploy de `firestore.rules` (paso manual explícito, como toda regla nueva en este proyecto).

**Fase 2 — precisión, no bloquea el fix del incidente:**
- Decrementar `peopleCount` cuando un invitado pasa a `rsvpStatus: 'no'` sin ser eliminado (§5.1) — beneficia también las estadísticas ya existentes fuera de esta feature.
- Auditoría corta de protección anti-doble-envío en `EventJoin.tsx`.
- Confirmar que `EventJoin.tsx` escucha el evento en vivo (no solo lo lee una vez al cargar), para que la pantalla lleno/formulario cambie sola si el organizador ajusta el cupo.

**Fase 3 — futuro, explícitamente fuera de alcance:**
- Lista de espera (§12), sobre el punto de extensión ya dejado preparado.

---

## 14. Qué queda para decisión tuya antes de implementar

- Confirmar la decisión de §1.2 (reutilizar `capacity` en vez de agregar un campo separado) — es la que más afecta el copy visible y el contrato de un campo ya en uso.
- Confirmar que "pendiente cuenta como ocupando un lugar" (§5) es el comportamiento que se quiere — es una decisión de producto, no solo técnica, y es la única realmente discutible del diseño.
