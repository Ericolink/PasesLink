# Expansión de plataforma: pago real, Seating Chart, Anfitrión en Vivo, CRM

Documento de arquitectura para los 4 pilares solicitados como "salto de producto" para PaseLink. De los 4, se **construyeron** Seating Chart y Anfitrión en Vivo (más la infraestructura compartida que ambos usan) en este ciclo; Pasarela de pago real y CRM de invitados recurrentes quedan **documentados aquí, sin implementar**, por las razones explicadas en cada sección. Complementa (no reemplaza) `INVITATION_COMPETITIVE_ANALYSIS.md` §6/§8, que ya había identificado estas 4 funcionalidades como los gaps de mayor impacto/esfuerzo.

## 0. Resumen ejecutivo

| Módulo | Estado | Motivo |
|---|---|---|
| Infraestructura compartida (permisos, feed de check-ins en vivo, `AppShell` modo pantalla grande) | ✅ Implementado | Base para los otros 3 |
| Seating Chart | ✅ Implementado (modelo + CRUD + asignación; sin drag&drop/plano visual) | Complejidad acotada, sin dependencias externas |
| Anfitrión en Vivo | ✅ Implementado | Reutiliza casi 100% infraestructura existente, sin backend nuevo |
| Pasarela de pago real | 📋 Solo arquitectura | **Bloqueado**: requiere un endpoint que reciba webhooks de forma síncrona; PaseLink es deliberadamente Spark (sin Cloud Functions) — decisión del usuario: posponer hasta evaluar el upgrade a Blaze |
| CRM de invitados recurrentes | 📋 Solo arquitectura | Alto esfuerzo/complejidad (igual que pago); se prioriza en una sesión futura con alcance propio |

Todo lo implementado es **aditivo**: ningún campo existente cambió de tipo o significado, ninguna colección existente cambió su forma salvo por campos nuevos opcionales. No se requirió tocar Cloud Functions (no existen en este proyecto) ni agregar índices compuestos nuevos — todas las queries nuevas son de un solo campo, cubiertas por indexación automática de Firestore.

---

## 1. Infraestructura compartida

Construida primero porque tanto Seating Chart como Anfitrión en Vivo la necesitan, y porque el pedido original la identificó como el patrón correcto ("si detectas necesidades comunes, crea primero la infraestructura").

- **2 permisos granulares nuevos** (`manageSeating`, `viewLiveDashboard`) en `CoOrganizerPermissions` — mismo patrón aditivo que los 13 permisos existentes, con default `true` para organizadores/coanfitriones legacy (no rompe accesos existentes).
- **`subscribeToRecentCheckins`** (`src/firebase/reports.ts`): primer listener en tiempo real (acotado con `limit()`) sobre `events/{eventId}/checkins`. Antes esa colección solo se leía puntualmente (`getCheckins`, ver el comentario ahí sobre por qué — costo de un listener sin techo). Esta función es explícitamente reutilizable: la usa Anfitrión en Vivo hoy y queda lista para "pantallas secundarias" o widgets históricos futuros sin volver a escribirla.
- **`entry_blocked`**: nuevo tipo de entrada en el log de check-ins (`CheckinLog`), escrito por `checkInGuest` cuando bloquea un reingreso tras salida definitiva — el único caso real de "rechazo" hoy (a diferencia de `payment_required`, que el propio escáner resuelve en el momento). Es lo que permite a Anfitrión en Vivo mostrar "invitados rechazados".
- **`AppShell mode="display"`**: cuarto modo de shell (junto a `browse`/`focus`/`kiosk`), pensado para pantalla grande/TV — sin `BottomTabBar`, sin el chrome de kiosko público (quien abre esta pantalla siempre está autenticado).

Estas piezas están desacopladas de Seating Chart/Anfitrión en Vivo específicamente — un futuro "historial de accesos en vivo" o una pantalla secundaria de puerta puede montarse sobre las mismas sin cambios.

---

## 2. Seating Chart

### Modelo de datos

Nueva colección `events/{eventId}/tables/{tableId}` (`SeatingTableData`): `name`, `capacity`, `shape` (`round | rectangular | square | custom`, solo afecta el ícono), `zone` (string libre), `position` (reservado, no usado todavía), `sortOrder`, `notes`.

La asignación invitado→mesa vive en `GuestData.tableId` (no como array en la mesa) — patrón estándar para relaciones muchos-a-uno en Firestore: mover un invitado es una sola escritura acotada (`{ tableId }`), nunca hay que reescribir el documento de la mesa. La ocupación de una mesa se calcula sumando `partySize()` de los invitados con ese `tableId`, usando el array de invitados que la pantalla ya tiene cargado (`useEvent()`) — **cero queries adicionales**.

### Por qué el modelo ya soporta lo que no se construyó todavía

- **Distintas distribuciones / planos personalizados**: `position: {x,y}` ya existe en el tipo, sin usar — el día que se construya un plano con drag&drop, no hace falta migrar datos, solo empezar a escribir ese campo.
- **Zonas / salones múltiples**: `zone` ya es un campo libre por mesa. Si un evento necesita gestionar zonas como entidades propias (capacidad de zona, plano por zona), se promueve a una subcolección `events/{eventId}/zones/{zoneId}` y `SeatingTableData.zone` pasa a ser una referencia — cambio aditivo, no rompe mesas existentes.
- **Impresión de planos / tarjetas de mesa / credenciales**: todos son **derivados** del modelo actual (mesa + invitados asignados + `qrToken` que cada invitado ya tiene) — no requieren ningún campo nuevo, solo una vista de impresión.
- **Drag & drop**: la UI actual (lista + modal de asignación) ya llama a la misma función (`assignGuestToTable`) que llamaría un drag&drop — es un cambio de interacción, no de arquitectura.

### Permisos y reglas

`manageSeating` gatea crear/editar/borrar mesas y reasignar invitados. Un coanfitrión con *solo* `manageSeating` (sin `editGuests`) puede mover gente de mesa sin heredar edición completa del invitado — regla angosta en `firestore.rules` que solo permite tocar el campo `tableId`, mismo principio que ya usan `scanQr`/`confirmPayments`.

**Sobrecupo se detecta, no se impide** (pedido explícito): las reglas no rechazan una asignación que exceda `capacity` — la UI muestra la advertencia (`TableCard`, badge rojo). Verificado con un test de emulador dedicado.

### Impacto en Firestore/costos

Sin índices nuevos (la vista de mesas reutiliza el array de invitados ya cargado, no hace una query por mesa). Para un evento de **miles** de invitados, esto significa que Seating Chart no agrega costo de lectura más allá del que ya paga `EventDetail`/`Reports` al cargar la lista completa. Si en el futuro se necesita una vista de mesas que NO cargue todos los invitados (ej. una pantalla de solo-lectura para el día del evento), ahí sí haría falta un índice sobre `guests.tableId` y una query por mesa — no se agregó preventivamente para no pagar ese costo sin necesidad real.

---

## 3. Anfitrión en Vivo

### De dónde sale cada métrica

| Métrica | Fuente | En vivo |
|---|---|---|
| % de ocupación | `event.occupancyCount` / `event.capacity` | Sí (listener existente) |
| Check-ins recientes / ingresando | `subscribeToRecentCheckins` | Sí |
| Invitados pendientes | `event.peopleCount - event.checkedInCount` | Sí (contadores denormalizados) |
| Invitados rechazados | mismo feed, filtrado por `type === 'entry_blocked'` | Sí |
| Invitados VIP | `getCountFromServer` con `where('tags','array-contains', event.vipTagId)` | No — polling cada 30s |

La métrica VIP es la única que no es en tiempo real, por diseño: Firestore no ofrece un *listener* de agregación (solo lecturas puntuales tipo `getCountFromServer`), y bajar la lista completa de invitados para contar cuántos tienen una etiqueta no escala a un evento de miles. El trade-off (conteo "casi en vivo" en vez de instantáneo, solo para esta tarjeta) está documentado en el propio hook (`useHostLiveDashboard.ts`) y se degrada con gracia: si el coanfitrión no tiene permiso de leer invitados (`viewGuestList`), la tarjeta simplemente no se muestra en vez de romper el resto del dashboard.

`EventData.vipTagId` reutiliza el catálogo de segmentos (`guestTags`) que ya existía para el motor de visibilidad de secciones — no se introdujo un concepto de "tier" nuevo.

### Confeti y reducción de movimiento

Los arribos se agrupan en ventanas de ~800ms antes de disparar un solo *burst* de `canvas-confetti` (evita degradar rendimiento con una puerta muy activa), y se omite por completo — no se "reduce" — cuando `prefers-reduced-motion` está activo, mismo criterio que ya usa el resto de la app (`WelcomeModal`).

### Por qué está lista para escalar

- **Múltiples accesos/escáneres simultáneos**: ya funciona sin cambios — cualquier escáner autorizado escribe al mismo `events/{eventId}/checkins`, y Anfitrión en Vivo solo escucha esa colección. No hay un cuello de botella de un solo escáner "dueño" del estado.
- **Pantallas secundarias**: `subscribeToRecentCheckins` es genérica (recibe `limitCount`), lista para alimentar una segunda pantalla con otro recorte sin duplicar lógica.
- **Estadísticas históricas**: `event.checkinsByHour` (ya existente, usado por Reports) es la misma fuente que alimentaría un futuro panel de "histórico de esta pantalla".
- **Modo kiosco público (sin login)**: hoy Anfitrión en Vivo requiere sesión (`ProtectedRoute`, igual que Reports/Scanner) — se decidió así para no construir un sistema de tokens de acceso público en esta iteración. La ruta separada (`AppShell mode="display"`) y el hook ya devuelven datos agregados (no expone teléfono/email), así que agregar un modo de token público más adelante es una capa de auth nueva sobre la misma pantalla, no un rediseño.

---

## 4. Pasarela de pago real (arquitectura propuesta, sin implementar)

### Por qué se pospuso

PaseLink corre en el plan Firebase **Spark** (gratis) a propósito — no hay Cloud Functions, todo backend es Firestore + `firestore.rules` + GitHub Actions cron cada ~10 minutos (ver comentario explícito en `firestore.rules`, función `isAdmin()`). Un webhook real de Stripe/Mercado Pago **necesita** un endpoint que responda de forma síncrona en el momento en que el proveedor lo llama — un cron de 10 minutos no puede cumplir ese contrato sin introducir minutos de latencia entre "el banco aprobó el pago" y "el invitado tiene su acceso confirmado", que es exactamente el problema que esta funcionalidad busca resolver. El usuario decidió posponer esta funcionalidad hasta evaluar el upgrade a Blaze (que tiene capa gratuita amplia — 2M invocaciones/mes — así que en la práctica seguiría siendo gratis a esta escala, pero es un cambio de plan que merece decidirse aparte).

### La base ya existe

`GuestData.paymentStatus` (`unpaid → pending_confirmation → paid`, con rechazo volviendo a `unpaid`) fue diseñado **explícitamente** para esto — el comentario en `src/types/index.ts` dice, textual: *"pensado para que el día que exista una pasarela de pago real, este estado lo resuelva un webhook en segundos en vez de un organizador a mano — la máquina de estados no cambia, solo quién la dispara"*. Es decir: la pasarela real no necesita un modelo de datos nuevo para el estado del pago, solo un disparador distinto para las mismas transiciones que ya ejecuta `setGuestPaymentStatus`/`confirmPaymentAndCheckIn` (`src/firebase/guests.ts`).

### Capa de abstracción propuesta

```ts
interface PaymentOrder {
  id: string
  eventId: string
  guestId: string
  amountMinorUnits: number   // enteros, no floats — ver §4.3
  currency: string           // ISO 4217, ej. "MXN"
  status: 'created' | 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled' | 'refunded'
  providerId: 'mercadopago' | 'stripe' | 'manual'
  providerRef?: string       // id de la transacción en el proveedor
  createdAt: number
  updatedAt: number
}

interface PaymentProvider {
  createOrder(input: NewOrderInput): Promise<PaymentOrder>
  // Invocado por el webhook receptor (fuera de este cliente) — valida la
  // firma del proveedor y traduce su payload al PaymentOrder interno.
  handleWebhook(rawPayload: unknown, signature: string): Promise<PaymentOrder>
  refund(orderId: string): Promise<PaymentOrder>
}
```

Cada proveedor (`MercadoPagoProvider`, `StripeProvider`, `ManualTransferProvider`) implementa esta interfaz. El proveedor `manual` (transferencia/efectivo) es, en los hechos, **el que ya existe** hoy (`setGuestPaymentStatus`) — se envuelve en la misma interfaz para que el resto del sistema (UI, reportes, reembolsos) no distinga "pago manual" de "pago por pasarela" salvo por qué `PaymentProvider` lo resolvió.

Responsabilidades separadas explícitamente (pedido del usuario):

| Responsabilidad | Dónde vive | Nuevo/existente |
|---|---|---|
| Creación de orden | `PaymentProvider.createOrder` | Nuevo |
| Procesamiento del pago | El proveedor externo (Stripe/MP), fuera de PaseLink | — |
| Confirmación | `PaymentProvider.handleWebhook` → transición de `GuestData.paymentStatus` | Nuevo trigger, máquina de estados existente |
| Webhook | Endpoint HTTP (Cloud Function o serverless externo, ver §4.4) | Nuevo — el gap real |
| Emisión del boleto | `qrToken` (ya existe desde que se crea el invitado) | Existente |
| Actualización del RSVP | `rsvpStatus` (ya existe) | Existente |
| Generación del QR | Ya existe (`generateQrToken`, `guests.ts`) | Existente |
| Historial de transacciones | `events/{eventId}/guests/{guestId}/payments/{paymentId}` | Nueva subcolección — hoy NO existe ningún ledger, solo el contador `paidCount` |
| Reembolsos futuros | `PaymentProvider.refund` + nuevo estado `refunded` | Nuevo |

### Soporte a pagos parciales, múltiples tipos de boleto, monedas, cupones

Ninguno existe hoy (`EventData.ticketPrice` es un único número por evento). Extensión propuesta, aditiva:

```ts
interface TicketType {
  id: string
  label: string             // "General", "VIP", "Niño"
  priceMinorUnits: number
  currency: string
  capacity?: number          // sub-cupo opcional dentro de event.capacity
}
// EventData.ticketTypes?: TicketType[]  — ausente = comportamiento actual (precio único)
// GuestData.ticketTypeId?: string
// GuestData.discountCode?: string
// GuestData.amountDueMinorUnits?: number  — snapshot del monto real cobrado, no recalculado
```

`amountDueMinorUnits` es importante: hoy el monto se **deriva** en el cliente (`ticketPrice * partySize`) en cada pantalla — no hay forma de representar un pago parcial o con descuento sin guardar el monto real cobrado en algún lado. Enteros en unidad mínima (centavos), no `number` flotante — Stripe/Mercado Pago exigen esto, y el campo actual (`ticketPrice: number` con `step="0.01"`) no es seguro para aritmética de dinero.

### Flujo de estados y consistencia pago↔acceso

El diagrama de estados no cambia respecto al ya construido — solo gana transiciones disparadas por webhook en vez de por un organizador:

```
unpaid → pending_confirmation → paid
   ↑              ↓  (rechazo)
   └──────────────┘
paid → refunded (nuevo, solo con pasarela real)
```

Casos a cubrir explícitamente por el webhook receptor (no por el cliente):
- **Pendiente**: el proveedor notifica `pending` (ej. pago en efectivo vía OXXO/Mercado Pago) — mapea a `pending_confirmation`, igual que el flujo manual actual.
- **Rechazado**: vuelve a `unpaid` (nunca a un estado "fallido" separado, mismo criterio que ya usa el rechazo manual).
- **Reintentos**: cada intento es una `PaymentOrder` nueva (no se reutiliza el id) — el historial de transacciones (§4.2) es lo que permite auditar reintentos sin perder el rastro del primero.
- **Expiración**: una orden `created`/`pending` que nunca se resuelve pasa a `expired` tras el timeout del proveedor — **no** reintroduce el "apartado temporal" (`holdExpiresAt`) que se eliminó deliberadamente en julio 2026 (ver `firestore.rules`, comentario sobre el barrido de reservas ya removido): expirar la *orden de pago* es distinto de expirar el *cupo del invitado*, que sigue sin bloquearse por pago (decisión de producto ya tomada, no se revierte acá).
- **Inconsistencia pago↔acceso**: se evita por diseño porque `paymentStatus` sigue siendo el único campo que gatea el acceso (`checkInGuest`) — la pasarela solo cambia quién escribe ese campo, nunca introduce un segundo campo de "acceso" que pueda desincronizarse del de "pago".

### El gap real: dónde vive el webhook

Sin Cloud Functions, dos opciones viables, ninguna implementada:

| Opción | Pros | Contras |
|---|---|---|
| **Firebase Cloud Functions** (requiere upgrade a Blaze) | Mismo proyecto Firebase, mismas credenciales, `firebase-admin` ya es dependencia del repo (usado en `scripts/`) | Cambio de plan (aunque con capa gratuita amplia) |
| **Serverless externo** (Cloudflare Workers/Vercel) | Mantiene Firestore en Spark | Cuenta nueva fuera de Firebase, credenciales de servicio para escribir en Firestore desde afuera, una plataforma de despliegue más que mantener |

El usuario ya indicó preferencia por evaluar Blaze antes de retomar esto — esta tabla queda para cuando se tome esa decisión.

---

## 5. CRM de invitados recurrentes (arquitectura propuesta, sin implementar)

### Por qué se pospuso

Mismo motivo que la pasarela: alto esfuerzo/complejidad (ver `INVITATION_COMPETITIVE_ANALYSIS.md` §9, fila "CRM ligero de invitados recurrentes" — complejidad Alta, esfuerzo Alto). El usuario priorizó los 2 módulos de menor riesgo para esta sesión; el CRM merece su propia sesión con foco completo, no una implementación apurada de una funcionalidad que el propio pedido describe como "no romper nada, no duplicar registros, resolver conflictos".

### Lo que ya está construido y hay que reutilizar (no duplicar)

- **`GuestData.guestUid`**: liga un invitado de UN evento a una cuenta `users/{uid}` — ya existe.
- **`users/{uid}/invitations/{eventId}`**: ya es, de hecho, el historial de eventos de un INVITADO (usado por `/my-invitations`). El CRM del lado del ORGANIZADOR es la vista espejo de esto mismo, no una estructura nueva desde cero.
- **`reclaimInvitationsByEmail`** (`src/firebase/invitationRecovery.ts`): ya resuelve "encontrar todas las invitaciones de este email verificado entre eventos", vía `collectionGroup('guestContacts')` — es el mecanismo de vinculación que el CRM necesita, no algo a reinventar.
- **"Primero en reclamar, gana"**: la estrategia de resolución de conflictos ante un `guestUid` ya asignado ya existe en `firestore.rules` — el CRM hereda ese mismo criterio en vez de definir uno nuevo.

### Modelo de datos propuesto

Separación explícita pedida por el usuario — contacto / participación / historial / etiquetas / notas:

```ts
// users/{uid} — YA EXISTE, es el "contacto" (nombre, email, teléfono, foto)

// Nueva subcolección, del lado del ORGANIZADOR (no del invitado):
// organizers/{ownerId}/crmContacts/{guestUid}
interface CrmContact {
  guestUid: string
  displayName: string          // snapshot, no requiere leer users/{uid} en cada vista
  firstSeenEventId: string
  eventsAttended: number       // contador denormalizado
  lastEventDate: string
  tags?: string[]              // etiquetas propias del organizador, NO las de un evento puntual
  notes?: string                // notas privadas del organizador sobre este invitado
  updatedAt: number
}
// Escrito/actualizado cuando un guest con guestUid hace check-in o se le
// asigna paymentStatus:'paid' en CUALQUIER evento de ese organizador — no en
// cada RSVP, para no generar ruido con invitados que nunca llegaron a asistir.
```

`organizers/{ownerId}/crmContacts/` (no un campo dentro de `users/{uid}`) porque el CRM es propiedad del ORGANIZADOR, no del invitado — dos organizadores distintos que comparten un invitado en común no deben ver las notas/etiquetas que el otro le puso (aislamiento de datos, mismo criterio que ya separa `guestTags` por evento).

### Estrategia de deduplicación

- **Invitado con cuenta (`guestUid` presente)**: identidad estable, cero ambigüedad — es la fuente de verdad del CRM. Cubre la mayoría de los casos gracias a que el autoregistro y `/my-invitations` ya empujan a los invitados a crear cuenta.
- **Invitado sin cuenta** (alta manual del organizador, nunca reclamado): no hay identidad estable — proponer coincidencia por email/teléfono normalizado es **candidato a fusión**, nunca fusión automática. Un merge silencioso que una a dos personas distintas con el mismo email compartido (pareja, familia) sería el tipo de bug "difícil de deshacer" que este mismo documento de instrucciones pide evitar. La UI del CRM mostraría "¿Es la misma persona que [X]?" como acción explícita del organizador, nunca implícita.

### Índices nuevos que haría falta declarar

- `collectionGroup('guests').where('guestUid','==', uid)` — para reconstruir "a qué eventos de ESTE organizador asistió este invitado" si se prefiere calcular en vivo en vez de mantener el contador denormalizado de `CrmContact`. Con el contador denormalizado (recomendado, mismo patrón que `paidCount`/`checkinsByHour` en el resto del proyecto), este índice pasa a ser opcional/de soporte, no crítico.

### Lo que prepara para segmentación/campañas/automatizaciones futuras

`CrmContact.tags` (propios del organizador, no del evento) es la base de "listas inteligentes" futuras (ej. "invitados que asistieron a 3+ eventos"), sin requerir otro modelo — es el mismo patrón `tags: string[]` + catálogo que ya valida el motor de segmentación de un solo evento (`guestTags`/`SectionVisibilityRule`).

---

## 6. Resumen de impacto en Firestore / Cloud Functions / costos

| Módulo | Colecciones nuevas | Índices nuevos | Cloud Functions | Costo incremental |
|---|---|---|---|---|
| Infra compartida | Ninguna | Ninguno | Ninguna | Un listener acotado más por sesión de Anfitrión en Vivo |
| Seating Chart | `events/{id}/tables` | Ninguno | Ninguna | Mínimo — reutiliza datos ya cargados |
| Anfitrión en Vivo | Ninguna | Ninguno | Ninguna | 1 listener acotado + 1 aggregation query cada 30s (solo si `vipTagId` está configurado) |
| Pago real (futuro) | `.../guests/{id}/payments` | A definir según queries de reportes de pago | **Sí, o serverless externo** — el único módulo de los 4 que rompe el "sin backend propio" actual | Depende del volumen de webhooks; capa gratuita de Blaze cubre la escala actual con margen |
| CRM (futuro) | `organizers/{id}/crmContacts` | Opcional (`guests.guestUid` collectionGroup) | Ninguna | Bajo — contadores denormalizados, mismo patrón ya usado en el resto del proyecto |

Ningún módulo implementado en este ciclo requiere el upgrade a Blaze. Pago real es, de los 4, el único que estructuralmente lo necesita para funcionar como pasarela real (no como flujo manual mejorado).
