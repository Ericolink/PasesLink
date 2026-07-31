# RFC: Sistema de venta de alimentos y bebidas durante el evento ("Concessions")

**Estado:** Propuesta — sin implementar.
**Autor:** Diseño asistido (Claude) a pedido del admin de PaseLink.
**Fecha:** 2026-07-30.
**Alcance del rollout inicial:** exclusivo para la cuenta admin de PaseLink (beta cerrada), arquitectura pensada para apertura pública posterior sin migración de datos.

---

## 0. Resumen ejecutivo

| Aspecto | Decisión |
|---|---|
| Nombre interno (código/Firestore) | `concessions` — **no** `menu`, porque `EventData.menu` ya existe (selección de plato del RSVP, ej. "pollo o pescado"). De cara al invitado la sección se sigue llamando **"Menú"**. |
| Nueva colección top-level | Ninguna. Todo vive bajo `events/{eventId}/...`, igual que el resto de la app. |
| Subcolecciones nuevas | `concessionsCatalog`, `concessionsOrders`, `concessionsFulfillment` (proyección de solo-lectura de `concessionsOrders`, ver §4.3). |
| Cloud Functions requeridas | **Cero.** El proyecto está en plan Spark (sin Blaze) — confirmado en `firestore.rules`, `src/firebase/admin.ts` y `scripts/backup-firestore.mjs`. Todo se resuelve con Security Rules + transacciones cliente, igual que el pago de entrada. Tareas de mantenimiento (barridos de pedidos abandonados, reportes) se hacen con el mismo patrón de cron de GitHub Actions + `firebase-admin` que ya usa el proyecto. |
| Gating de beta | Campo `concessions.enabled` en `EventData`. Solo un `isAdmin()` puede escribirlo a `true` mientras el módulo esté en beta. Cuando pase a GA, se relaja la regla para que cualquier organizador lo autoactive — **cero cambios de esquema**. |
| Rol nuevo | **Menu Manager** (encargado del menú), sin cuenta especial: es un UID de Firebase Auth agregado a un mapa en el evento, igual que los coorganizadores. |
| Aislamiento de dinero | Los datos de pago (comprobante, nota, monto, método) viven en `concessionsOrders`. Los datos de cocina (qué preparar, para quién, en qué estado) viven en una proyección aparte, `concessionsFulfillment`, con el **mismo ID de documento** que el pedido — mismo patrón que ya usa el repo para separar `guests` de `guestContacts`. El Menu Manager solo tiene permiso de lectura/escritura sobre `concessionsFulfillment`, nunca sobre `concessionsOrders`. Esto no es una convención de UI: es imposible para el Menu Manager leer comprobantes o montos aunque intente llamar a Firestore directo, porque las Security Rules se lo niegan a nivel de documento. |
| Reserva de inventario | Se descuenta stock **en el momento de crear el pedido** (checkout), dentro de una transacción atómica — no al agregar al carrito. El carrito es 100% estado local del cliente (no se persiste), así que "carrito abandonado" antes de pagar tiene costo cero. Ver §11 y la decisión abierta en §14.1 sobre qué hacer con pedidos creados y nunca pagados. |
| Reutilización del sistema de pagos de entrada | Se reutilizan `EventData.paymentMethods`, `EventData.paymentInstructions`, `EventData.organizerContactPhone`, el hook `useEventPermissions`, el patrón `runTransaction` + `increment()`, el patrón `subscribeToX` con `withListenerReporting`, y el permiso `confirmPayments` ya existente. Lo único genuinamente nuevo es la subida de **foto** de comprobante (hoy el pago de entrada solo pide texto). |

---

## 1. Por qué "concessions" y no "menu" en el código

`EventData.menu = { options: MenuOption[], restrictions: DietaryRestriction[] }` y `src/components/EventInfoPanel/sections/MenuSection.tsx` ya existen y significan "qué vas a comer en el banquete" (selección de plato, alergias). Si el nuevo módulo también se llama `menu` en el código, cualquier búsqueda, tipo o componente futuro se vuelve ambiguo. Se usa `concessions` (término estándar de la industria de eventos/estadios para venta de comida y bebida in situ) puramente como namespace técnico. Todo el copy visible para el invitado y el organizador dice "Menú" / "Barra" / lo que el organizador configure como nombre de tienda — el usuario final nunca ve la palabra "concessions".

---

## 2. Diseño UX del flujo

### 2.1 Invitado

```
GuestPass (invitación)
  └─ EventInformationPanel (acordeón existente)
       └─ [nueva sección] "Menú"  ← visible solo si concessions.enabled && catálogo activo no vacío
            resumen: "3 productos disponibles · desde $35"
            al expandir: grid de tarjetas de producto (foto, nombre, precio/Gratis, categoría, disponibilidad)
            botón flotante "Ver carrito (N)" aparece en cuanto hay ≥1 ítem
                 ↓
       [Modal/pantalla] Carrito
            lista de líneas (nombre, cantidad, +/-, subtotal por línea)
            resumen: subtotal, total, cantidad de artículos
            botón "Continuar al pago" (o "Confirmar pedido" si total = $0)
                 ↓
       [Modal/pantalla] Checkout — independiente del pago de entrada
            elegir método: Transferencia | Efectivo (según lo que el organizador habilitó)
            Transferencia → muestra instrucciones (reutiliza o config propia, ver §6) + botón "Subir comprobante"
            Efectivo → muestra instrucciones ("Paga en taquilla antes de recoger tu pedido") + botón "Ya avisé en taquilla" (deja el pedido en awaiting_payment, lo confirma el organizador)
                 ↓
       [Estado] Pedido #A3F9 — "Esperando confirmación de pago"
            en tiempo real (onSnapshot) pasa a "Pago confirmado" → "En preparación" → "Listo para recoger" → "Entregado"
            el invitado puede ver este estado desde una nueva pestaña/atajo "Mis pedidos" dentro de su GuestPass, no solo en el momento en que lo hizo (soporta que cierre y reabra la invitación)
```

Reglas de UX explícitas pedidas por el usuario y cómo se resuelven:
- *"No quiero convertir PaseLink en una tienda"* → sin barra de búsqueda, sin filtros avanzados, sin checkout multi-paso tipo e-commerce. Categorías como simple filtro de chips (Bebidas/Comida/Snacks/Souvenirs/Especiales), catálogo típico de un evento pequeño (decenas de productos, no cientos). El carrito y el checkout viven en modales sobre el GuestPass, nunca navegan a una "app" separada con su propio layout.
- El acordeón "Menú" sigue el mismo patrón de todas las demás secciones del panel (`EventInfoSection.tsx`): si no hay catálogo, la sección ni siquiera se renderiza (`return null`), igual que `MenuSection.tsx` actual.

### 2.2 Organizador / coorganizador con `manageConcessions`

```
EventDetail → nueva pestaña "Menú" (junto a Reportes, Invitados, etc.)
  ├─ Catálogo: alta/edición de productos (foto, nombre, descripción, categoría, precio o "gratis", stock)
  ├─ Configuración: nombre de la tienda, métodos de pago aceptados, datos bancarios (propios o los del evento), instrucciones de recolección
  ├─ Pedidos: cola de pedidos con paymentPhase = proof_submitted primero ("necesitan tu atención"), luego el resto
  │     → acción "Confirmar pago" / "Rechazar" (con motivo) — mismo patrón que confirmar pago de entrada
  │     → acción "Cancelar pedido" (libera stock)
  └─ Encargados del menú: agregar/quitar Menu Managers por email (igual que se agregan coorganizadores)
```

### 2.3 Menu Manager (encargado)

Vista deliberadamente mínima, sin acceso al resto del panel de organizador:

```
/events/:eventId/kitchen  (ruta dedicada, no el dashboard de organizador)
  Cola de pedidos pagados, ordenados por antigüedad:
  ┌─────────────────────────────┐
  │ Pedido #A3F9  ·  hace 4 min │
  │ Juan Pérez                  │
  │ 2× Soda italiana            │
  │ 1× Café frío                │
  │ [Pendiente de preparar ▾]   │
  └─────────────────────────────┘
  Botones: Pendiente → Preparando → Listo → Entregado (avance lineal, con opción de deshacer un paso)
  Botón aparte en el catálogo (solo lectura + "Marcar agotado"): lista de productos con toggle "Agotado"
```

Nunca aparece: precio, subtotal, total, método de pago, comprobante, nombre de banco, configuración del evento, lista de invitados completa, reportes.

---

## 3. Wireframes conceptuales (texto)

**Tarjeta de producto (grid del invitado):**
```
┌───────────────────────┐
│ [foto 4:3]             │
│ Soda italiana      🟢  │  🟢 disponible / 🟡 quedan pocas / ⚫ agotado
│ Sabor a elegir en barra│
│ Bebidas                │
│ $35 MXN     [ + ]      │  → si es gratis: "Gratis" en vez de precio
└───────────────────────┘
```

**Carrito:**
```
Tu pedido
─────────────────────────
2×  Soda italiana     $70
1×  Café frío          $40
─────────────────────────
Subtotal              $110
3 artículos
[ Continuar al pago ]
```

**Estado del pedido (vista del invitado, tiempo real):**
```
Pedido #A3F9
●───●───○───○───○
Enviado  Confirmado  Preparando  Listo  Entregado
"Tu comprobante fue confirmado. Tu pedido está en preparación."
```

---

## 4. Arquitectura Firestore

### 4.1 Config del módulo (campo en `EventData`, aditivo)

```ts
// src/types/index.ts — nuevo campo opcional en EventData
interface EventData {
  // ...campos existentes sin cambios...
  concessions?: ConcessionsConfig
}

export type ConcessionsCategory = 'drink' | 'food' | 'snack' | 'souvenir' | 'special'

export interface ConcessionsConfig {
  enabled: boolean                       // gate de beta, ver §7
  storeName?: string                     // ej. "Barra de Baile Improvisado"
  currency: string                       // normalmente = event.currency
  paymentMethods: PaymentMethod[]        // subconjunto de ['transfer','cash'], reutiliza el tipo existente
  useEventPaymentInstructions: boolean   // true = reusa event.paymentInstructions tal cual
  paymentInstructions?: string           // solo si useEventPaymentInstructions = false
  pickupInstructions?: string            // "Recoge tu pedido en la barra central"
  concessionsStaffMap: Record<string, true>  // uid → true, igual patrón que coOrganizersMap
}
```

No se crea una colección `bankDetails` estructurada nueva porque el sistema actual de pago de entrada tampoco la tiene (`paymentInstructions` es texto libre) — inventar una segunda estructura paralela solo para este módulo sería inconsistente. Si en el futuro se estructura el pago de entrada (banco/CLABE/tarjeta como campos), este módulo hereda el mismo cambio gratis al compartir el campo.

### 4.2 Catálogo — `events/{eventId}/concessionsCatalog/{itemId}`

```ts
export interface ConcessionItem {
  id: string
  name: string
  description?: string
  category: ConcessionsCategory
  imageUrl?: string                 // Cloudinary, mismo patrón que cover photo
  priceMinorUnits: number           // enteros, nunca float — 0 = gratis (ver PLATFORM_EXPANSION_ARCHITECTURE.md §4, mismo criterio ya adoptado ahí)
  currency: string
  stockMode: 'unlimited' | 'limited'
  stockRemaining?: number           // solo si stockMode = 'limited'
  stockInitial?: number             // para mostrar "37/50 disponibles" en el panel del organizador
  soldCount: number                 // denormalizado, incrementado en la misma transacción del pedido
  status: 'active' | 'outOfStock' | 'archived'   // 'archived' = soft delete, nunca se borra el doc (ver §12.3)
  sortOrder: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

`status` es una máquina de 3 estados, no un booleano:
- `active` → visible y comprable.
- `outOfStock` → visible pero no comprable. Se llega aquí automáticamente cuando `stockRemaining` toca 0 (dentro de la misma transacción que agota el último ítem) **o** manualmente cuando el Menu Manager lo marca agotado (ej. se acabó el hielo aunque el contador diga que quedan sodas).
- `archived` → el organizador lo "eliminó". No se borra el documento porque pedidos históricos guardan una copia (`snapshot`) del ítem, pero si borráramos el doc perderíamos la capacidad de, por ejemplo, reactivarlo o ver analítica de catálogo. Nunca aparece en el catálogo del invitado ni del Menu Manager.

### 4.3 Pedido — split en dos documentos con el mismo ID (patrón `guests`/`guestContacts`)

**`events/{eventId}/concessionsOrders/{orderId}`** — fuente de verdad, dinero y pago. Solo lo leen: dueño, coorganizador con `manageConcessions` o `confirmPayments`, admin, y el propio invitado dueño del pedido.

```ts
export interface ConcessionOrderLine {
  itemId: string
  nameSnapshot: string             // copia del nombre AL MOMENTO de comprar — inmutable aunque el ítem cambie después
  categorySnapshot: ConcessionsCategory
  unitPriceMinorUnitsSnapshot: number
  quantity: number
  lineTotalMinorUnits: number
}

export type ConcessionPaymentPhase =
  | 'awaiting_payment'     // pendiente de pago (transferencia sin comprobante, o efectivo sin confirmar)
  | 'proof_submitted'      // comprobante enviado (solo aplica a transferencia)
  | 'confirmed'            // pago confirmado por el organizador (o automático si el pedido es 100% gratis)
  | 'rejected'             // comprobante rechazado, vuelve a awaiting_payment tras que el invitado reintente
  | 'cancelled'            // cancelado (por invitado antes de pagar, o por organizador en cualquier momento)

export interface ConcessionOrder {
  id: string
  eventId: string
  guestId: string
  guestNameSnapshot: string
  items: ConcessionOrderLine[]
  subtotalMinorUnits: number
  totalMinorUnits: number           // = subtotal (sin impuestos/fees en v1, campo separado por si se agregan después)
  currency: string
  itemCount: number
  paymentMethod: PaymentMethod | null   // null si totalMinorUnits === 0 (pedido 100% gratis)
  paymentPhase: ConcessionPaymentPhase
  paymentNote?: string              // texto de referencia, igual que guest.paymentNote hoy
  paymentProofUrl?: string          // NUEVO patrón: primera vez que se sube foto de comprobante en el repo (ver §9)
  rejectionReason?: string
  cancelReason?: 'guest_cancelled' | 'organizer_cancelled' | 'refunded' | 'item_removed' | 'guest_removed_from_event' | 'event_cancelled'
  createdAt: Timestamp
  updatedAt: Timestamp
  paidAt?: Timestamp
}
```

**`events/{eventId}/concessionsFulfillment/{orderId}`** (mismo `orderId`) — proyección de cocina, cero dinero. La escribe el cliente en la misma transacción que crea/actualiza el pedido; el Menu Manager solo puede tocar `fulfillmentStatus` de aquí en adelante.

```ts
export type FulfillmentStatus =
  | 'not_ready'    // pago aún no confirmado — el Menu Manager NUNCA ve pedidos en este estado (ver regla en §8.3)
  | 'queued'       // pago confirmado, pendiente de preparar ("Pendiente de preparar" en la UI)
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled'

export interface ConcessionFulfillment {
  id: string                        // == orderId
  eventId: string
  guestNameSnapshot: string
  orderNumber: string                // código corto legible, ver §12.4 (no correlativo global — evita doc caliente)
  lines: { nameSnapshot: string; categorySnapshot: ConcessionsCategory; quantity: number }[]  // SIN precio
  fulfillmentStatus: FulfillmentStatus
  createdAt: Timestamp
  updatedAt: Timestamp
  deliveredAt?: Timestamp
}
```

Por qué la separación importa (y no es solo "por las dudas"): las Security Rules de Firestore autorizan **documentos completos**, no campos individuales. No existe forma de decir "este UID puede leer este documento pero sin el campo `paymentProofUrl`". Si el Menu Manager tuviera permiso de lectura sobre `concessionsOrders`, técnicamente podría leer comprobantes y montos con una llamada directa al SDK aunque la UI nunca se lo muestre. Separar en dos documentos es la única forma de que la restricción "no acceso a dinero ni comprobantes" sea real y no solo cosmética. Esto replica exactamente la razón por la que `guestContacts` está separado de `guests` en este mismo repo.

### 4.4 Índices compuestos nuevos (`firestore.indexes.json`)

| Colección | Campos | Para qué |
|---|---|---|
| `concessionsOrders` (collectionGroup) | `guestId` ASC, `createdAt` DESC | "Mis pedidos" del invitado (una equality + orderBy en campo distinto sí requiere índice compuesto en Firestore) |
| `concessionsFulfillment` (collectionGroup si se necesita cross-evento; si no, alcanza con el índice de colección normal) | `fulfillmentStatus` ASC, `createdAt` ASC | Cola del Menu Manager, ordenada FIFO, filtrando solo estados post-pago |

No se agrega índice para `concessionsCatalog` (colecciones chicas, decenas de ítems — se traen todos con un `onSnapshot` simple y se filtra/ordena en cliente, mismo criterio ya aplicado en Seating Chart según el research de este repo: "si se puede reusar un array ya cargado en memoria, no agregues un índice preventivo").

---

## 5. Estados — máquina de pedido explicada

El usuario pidió un flujo lineal: `Carrito → Pendiente de pago → Comprobante enviado → Pago confirmado → En preparación → Listo → Entregado → Cancelado`. Técnicamente se implementa como **dos campos ortogonales** (por la separación de §4.3), pero conceptualmente y en la UI se presenta como un único avance lineal:

| Paso del usuario | `paymentPhase` (doc protegido) | `fulfillmentStatus` (doc de cocina) | Quién puede provocar la transición |
|---|---|---|---|
| Carrito | *(no existe pedido todavía — estado 100% local del navegador)* | — | invitado |
| Pendiente de pago | `awaiting_payment` | `not_ready` | invitado (al hacer checkout, vía transacción) |
| Comprobante enviado | `proof_submitted` | `not_ready` | invitado (solo transferencia) |
| Pago confirmado | `confirmed` | `queued` | organizador/coorganizador con permiso, o automático si `totalMinorUnits === 0` |
| En preparación | `confirmed` | `preparing` | Menu Manager (o organizador) |
| Listo | `confirmed` | `ready` | Menu Manager |
| Entregado | `confirmed` | `delivered` | Menu Manager |
| Cancelado | `cancelled` | `cancelled` | invitado (solo si `awaiting_payment`/`proof_submitted`) u organizador (en cualquier momento antes de `delivered`) |
| Rechazado (bifurcación, no lineal) | `rejected` → vuelve a `awaiting_payment` | `not_ready` | organizador, con motivo obligatorio |

Casos especiales de la tabla:
- **Pedido 100% gratis** (todas las líneas con precio 0): al crear el pedido, la transacción fija `paymentPhase = 'confirmed'` y `fulfillmentStatus = 'queued'` directamente — nunca pasa por `awaiting_payment`. Sigue generando un pedido real que el Menu Manager ve y prepara.
- **Pedido mixto** (ítems gratis + de pago en el mismo carrito): se trata como un solo pedido de pago; el total cobrado es solo la suma de las líneas con costo, los ítems gratis viajan incluidos.
- **Efectivo**: no hay paso de "comprobante enviado" — pasa de `awaiting_payment` directo a `confirmed` cuando el organizador confirma que cobró en taquilla (acción manual, mismo patrón que hoy existe para el pago de entrada en efectivo).

---

## 6. Datos de pago: reutilizar o configurar aparte

Requisito del usuario: el organizador debe poder elegir entre los datos bancarios del evento o datos exclusivos para el menú.

```ts
if (concessions.useEventPaymentInstructions) {
  // se muestra event.paymentInstructions tal cual, sin duplicar el campo
} else {
  // se muestra concessions.paymentInstructions (propio)
}
```

Este flag evita el caso de "el organizador actualiza la CLABE del evento y se le olvida actualizarla en el menú" — el default (`useEventPaymentInstructions: true`) es la opción segura y la que se recomienda dejar preseleccionada en el formulario.

---

## 7. Feature flag de beta (acceso exclusivo al admin de PaseLink)

No existe hoy ningún sistema de feature flags en PaseLink (confirmado: no hay `src/config/`, ni colección de flags, ni customClaims — el único nivel de privilegio es `isAdmin()` vía documento en `/admins/{uid}`, de alta manual por consola). En vez de construir un sistema de flags nuevo, se seguiría el mismo patrón con el que se introdujeron *todas* las features nuevas de este repo hasta ahora: **un campo opcional en `EventData`**.

Mecanismo concreto: `concessions.enabled` es un campo cualquiera del documento del evento, pero la Security Rule que autoriza escribirlo a `true` exige `isAdmin()` mientras el módulo esté en beta:

```
// firestore.rules — dentro de match /events/{eventId}
function concessionsEnableChangeIsAllowed() {
  let wasEnabled = resource.data.get('concessions', {}).get('enabled', false);
  let willBeEnabled = request.resource.data.get('concessions', {}).get('enabled', false);
  // Activar (false → true) requiere admin mientras dure la beta.
  // Cualquier otro cambio a `concessions` (config, catálogo, etc.) no toca este flag y no pasa por acá.
  return wasEnabled == willBeEnabled || isAdmin();
}
```

Esto se combina con el resto de la regla de `update` sobre `events/{eventId}` (que ya exige `isOwnerOrCoOrg` + `canDo`). Consecuencia práctica:

1. **Hoy**: solo un admin de PaseLink puede poner `concessions.enabled = true` en un evento — típicamente el suyo propio, pero la regla también permite que el admin lo habilite manualmente en la cuenta de un organizador piloto sin tocar código (rollout controlado, sin deploy).
2. **En GA**: se borra `isAdmin()` de esa condición (o se cambia por `canDo(eventId, 'manageConcessions', false)`) y cualquier organizador puede autoactivarlo desde su configuración de evento. **No hay migración de datos** — los eventos que ya lo tenían activado siguen activados, los que no, simplemente ganan el botón de activarlo.

Todo el resto del módulo (catálogo, pedidos, `concessionsFulfillment`) ya está gateado transitivamente: sus reglas exigen `event.data.concessions.enabled == true` además del permiso correspondiente, así que aunque alguien intente crear un ítem de catálogo en un evento sin el flag, la escritura se rechaza.

No se propone un nuevo permiso de coorganizador (`manageConcessions`) además de este flag — sí se propone igual (ver §8.1), porque una cosa es "el evento tiene el módulo activado" (decisión de plataforma) y otra "quién dentro del equipo del evento puede administrarlo" (decisión del organizador, ya resuelta por el sistema de permisos existente).

---

## 8. Sistema de permisos

### 8.1 Nuevo permiso de coorganizador

Siguiendo la receta ya documentada en `src/types/coOrganizerPermissions.ts` ("sumarlo acá + a `LEGACY_COORG_DEFAULTS` + al chequeo en `firestore.rules`"):

```ts
export interface CoOrganizerPermissions {
  // ...15 permisos existentes...
  manageConcessions: boolean   // catálogo, config del módulo, alta/baja de Menu Managers
}
```

`LEGACY_COORG_DEFAULTS.manageConcessions = false` — a diferencia de otros permisos que se dieron en `true` por retrocompatibilidad, este es una feature nueva desde el día uno, así que ningún coorganizador existente debería heredarlo automáticamente; el organizador lo otorga explícitamente.

Para confirmar/rechazar pagos de pedidos de concessions **se reutiliza el permiso `confirmPayments` ya existente**, en vez de crear `confirmConcessionPayments`. Racional: el nivel de confianza requerido (ver dinero, comprobantes, decidir si algo se cobró) es el mismo que ya se le exige a quien confirma el pago de entrada; separar el permiso solo agrega superficie de configuración sin un caso de uso real que lo pida hoy. Si en el futuro el usuario quiere separar "confía en esta persona con la entrada" de "confía en esta persona con la barra", es un cambio de una línea siguiendo la misma receta.

### 8.2 Menu Manager — no es un coorganizador

Es deliberadamente **un rol distinto**, no un coorganizador con permisos limitados, porque el modelo de coorganizador da acceso de lectura a cosas que este rol nunca debe ver (lista completa de invitados con contactos, reportes, configuración). Se modela como membresía en `concessions.concessionsStaffMap: Record<uid, true>` dentro del propio evento (igual patrón que `coOrganizersMap`, ver §4.1) — no como coorganizador con un permiso "vacío".

Requiere una cuenta real de Firebase Auth (Google o email/password, lo que ya use el resto de la app para organizadores) porque necesita persistencia de sesión entre turnos/dispositivos y las Security Rules necesitan un `request.auth.uid` estable contra el cual comparar — un esquema tipo "link + PIN" (como el acceso de invitado) sería más débil para un rol operativo que trabaja horas seguidas el día del evento.

Alta: el organizador (o coorganizador con `manageConcessions`) ingresa el email del encargado → se resuelve a un UID (mismo mecanismo que ya debe existir para agregar coorganizadores por email) → se agrega a `concessionsStaffMap`.

### 8.3 Matriz de permisos completa

| Acción | Admin PaseLink | Organizador (owner) | Coorg. `manageConcessions` | Coorg. `confirmPayments` | Menu Manager | Invitado |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Activar el módulo (`concessions.enabled`) | ✅ (único, en beta) | ❌ hasta GA | ❌ | ❌ | ❌ | ❌ |
| Configurar catálogo, precios, stock | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Configurar métodos de pago / instrucciones del módulo | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Agregar/quitar Menu Managers | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver catálogo | ✅ | ✅ | ✅ | ✅ | ✅ (solo referencia) | ✅ |
| Armar carrito / crear pedido | — | — | — | — | ❌ | ✅ |
| Subir comprobante | ✅ (no aplica) | — | — | — | ❌ | ✅ (propio pedido) |
| Ver comprobantes / notas / montos | ✅ | ✅ | ✅ | ✅ | ❌ **(negado por Security Rules, no solo por UI)** | ✅ (propio pedido) |
| Confirmar / rechazar pago | ✅ | ✅ | opcional (si además tiene `confirmPayments`) | ✅ | ❌ | ❌ |
| Ver cola de pedidos pagados | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (solo el propio) |
| Cambiar Pendiente→Preparando→Listo→Entregado | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Marcar producto agotado manualmente | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Cancelar pedido propio antes de pagar | — | — | — | — | ❌ | ✅ |
| Cancelar cualquier pedido / liberar stock | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ (solo el propio, solo antes de `confirmed`) |

---

## 9. Security Rules (fragmentos)

```
match /events/{eventId} {
  function concessionsEnabled() {
    return eventDataFor(eventId).get('concessions', {}).get('enabled', false) == true;
  }
  function isConcessionsStaff(eventId) {
    return request.auth != null &&
      eventDataFor(eventId).get('concessions', {}).get('concessionsStaffMap', {}).get(request.auth.uid, false) == true;
  }

  match /concessionsCatalog/{itemId} {
    allow read: if concessionsEnabled() &&
      (canDo(eventId, 'manageConcessions', false) || isConcessionsStaff(eventId) || isOpenEvent(eventId) || isAdmin());
      // isOpenEvent() ya es el helper existente que autoriza lectura pública a invitados con acceso al evento
    allow create, update: if concessionsEnabled() &&
      (canDo(eventId, 'manageConcessions', false) || isAdmin()) &&
      request.resource.data.name is string && request.resource.data.name.size() > 0 && request.resource.data.name.size() <= 80 &&
      request.resource.data.priceMinorUnits is int && request.resource.data.priceMinorUnits >= 0 &&
      request.resource.data.category in ['drink','food','snack','souvenir','special'] &&
      request.resource.data.status in ['active','outOfStock','archived'];
    // el Menu Manager puede tocar status → 'outOfStock' pero nada más:
    allow update: if concessionsEnabled() && isConcessionsStaff(eventId) &&
      request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','updatedAt']) &&
      request.resource.data.status in ['active','outOfStock'];
    allow delete: if false; // soft delete únicamente (status = 'archived')
  }

  match /concessionsOrders/{orderId} {
    allow read: if concessionsEnabled() &&
      (canDo(eventId, 'manageConcessions', false) || canDo(eventId, 'confirmPayments', false) ||
       isAdmin() || isGuestOwnerOfOrder(eventId, orderId)); // reusa el mismo helper que ya autoriza a un invitado a leer SU guests/{guestId}
    allow create: if concessionsEnabled() && isGuestCreatingOwnOrder(eventId, orderId) &&
      request.resource.data.paymentPhase in ['awaiting_payment','confirmed'] &&
      request.resource.data.totalMinorUnits is int && request.resource.data.totalMinorUnits >= 0;
      // la validación fuerte de stock/precio ocurre en la transacción del cliente contra concessionsCatalog,
      // no en la regla — la regla solo garantiza forma e invariantes de tipo, igual criterio que el resto del repo
    allow update: if concessionsEnabled() && (
      // invitado: solo puede subir comprobante o cancelar su propio pedido no confirmado
      (isGuestOwnerOfOrder(eventId, orderId) &&
        resource.data.paymentPhase in ['awaiting_payment','rejected'] &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['paymentPhase','paymentNote','paymentProofUrl','updatedAt']) &&
        request.resource.data.paymentPhase in ['proof_submitted','cancelled']) ||
      // organizador: confirmar, rechazar, cancelar
      canDo(eventId, 'confirmPayments', false) || canDo(eventId, 'manageConcessions', false) || isAdmin()
    );
    allow delete: if false;
  }

  match /concessionsFulfillment/{orderId} {
    allow read: if concessionsEnabled() && (
      canDo(eventId, 'manageConcessions', false) || canDo(eventId, 'confirmPayments', false) || isAdmin() ||
      (isConcessionsStaff(eventId) && resource.data.fulfillmentStatus in ['queued','preparing','ready','delivered']) ||
      isGuestOwnerOfOrder(eventId, orderId)
    );
    // El Menu Manager NUNCA puede leer un doc en 'not_ready': la condición de arriba se evalúa
    // contra el documento ya existente (resource.data), así que un intento de leer un pedido
    // todavía no pagado se rechaza aunque el Menu Manager conozca el orderId.
    allow update: if concessionsEnabled() &&
      (isConcessionsStaff(eventId) || canDo(eventId, 'manageConcessions', false) || isAdmin()) &&
      resource.data.fulfillmentStatus in ['queued','preparing','ready'] &&
      request.resource.data.fulfillmentStatus in ['preparing','ready','delivered'] &&
      request.resource.data.diff(resource.data).affectedKeys().hasOnly(['fulfillmentStatus','updatedAt','deliveredAt']);
    allow create, delete: if false; // solo se crea junto con concessionsOrders, desde la transacción de checkout
  }
}
```

Notas:
- `isGuestOwnerOfOrder` / `isGuestCreatingOwnOrder` deben implementarse reusando el mismo mecanismo de identidad de invitado ya existente para `guests/{guestId}` (posesión de `lockToken`/`guestUid` según [[project_multidevice_guest_lock_v1]] y [[project_invitation_account_linking_v1]]) — no se inventa un segundo esquema de identidad para este módulo.
- El documento `concessionsFulfillment` se crea desde el cliente (no hay Cloud Function), en la misma transacción que crea `concessionsOrders`; por eso `create` en `concessionsFulfillment` no necesita regla propia más allá de "el documento hermano se está creando válidamente" — igual se deja `allow create: if false` explícito arriba y en su lugar la creación real ocurre porque la transacción del invitado escribe ambos documentos y la regla de `concessionsOrders.create` ya la cubre. **Ajuste necesario en implementación**: la regla de `create` de `concessionsFulfillment` debe replicarse en paralelo a la de `concessionsOrders.create` con el mismo chequeo de invitado dueño — se deja marcado aquí como punto a resolver en el PR de implementación, no es ambigüedad de diseño sino un detalle de sintaxis de `rules` a verificar contra el linter real de Firestore.

---

## 10. Cloud Functions: por qué cero, y qué las reemplaza

El proyecto está deliberadamente en plan Spark. Nada en este módulo requiere respuesta síncrona a un webhook externo (a diferencia de una pasarela de tarjeta real, que sí necesitaría Blaze — ver `PLATFORM_EXPANSION_ARCHITECTURE.md` §4, problema ya documentado y fuera de alcance aquí). Todo se resuelve así:

| Necesidad típica de "Cloud Function" | Reemplazo en PaseLink |
|---|---|
| Descontar stock de forma atómica al pagar | `runTransaction` en el cliente, igual que `confirmPaymentAndCheckIn` hoy |
| Notificar al Menu Manager en tiempo real cuando hay un pedido nuevo | `onSnapshot` sobre `concessionsFulfillment` filtrado por `fulfillmentStatus == 'queued'` — push real vía listener, no vía notificación server-side |
| Cancelar pedidos abandonados tras N horas | Nuevo script `scripts/expire-stale-concession-orders.mjs` + workflow de GitHub Actions con cron, mismo patrón que `rsvp-reminders.yml`/`send-notifications.yml`. Ver decisión abierta en §14.1 sobre si esto debe ser automático o un botón manual del organizador. |
| Reporte de ventas del evento | Se calcula en cliente leyendo `concessionsOrders` con `paymentPhase == 'confirmed'` (colección pequeña por evento), igual que ya se hace con Reports hoy — no requiere agregación server-side a esta escala. |

---

## 11. Gestión de inventario

1. **Momento de reserva**: al hacer checkout (crear el pedido), no al agregar al carrito. El carrito es estado de React puro, nunca toca Firestore.
2. **Transacción de checkout** (pseudocódigo, seguridad idéntica al patrón de `confirmPaymentAndCheckIn`):
   ```ts
   await runTransaction(db, async (tx) => {
     const itemRefs = cartLines.map(l => doc(db, 'events', eventId, 'concessionsCatalog', l.itemId))
     const itemSnaps = await Promise.all(itemRefs.map(ref => tx.get(ref)))
     for (const [i, snap] of itemSnaps.entries()) {
       const item = snap.data()
       if (item.status !== 'active') throw new ConcessionUnavailableError(item.name)
       if (item.stockMode === 'limited' && item.stockRemaining < cartLines[i].quantity) {
         throw new ConcessionInsufficientStockError(item.name, item.stockRemaining)
       }
     }
     itemSnaps.forEach((snap, i) => {
       const item = snap.data()
       if (item.stockMode === 'limited') {
         const remaining = item.stockRemaining - cartLines[i].quantity
         tx.update(itemRefs[i], {
           stockRemaining: remaining,
           soldCount: increment(cartLines[i].quantity),
           ...(remaining === 0 ? { status: 'outOfStock' } : {}),
         })
       } else {
         tx.update(itemRefs[i], { soldCount: increment(cartLines[i].quantity) })
       }
     })
     tx.set(orderRef, { /* ... precio y snapshot leídos de itemSnaps, nunca del carrito local ... */ })
     tx.set(fulfillmentRef, { /* ... */ })
   })
   ```
   **Punto crítico**: el precio y la disponibilidad se leen del documento fresco dentro de la transacción, **nunca** del estado local del carrito — así se resuelve de raíz "cambio de precio después de agregar al carrito" y "producto eliminado mientras alguien compra" (ver §12).
3. **Liberación de stock**: cualquier cancelación (invitado antes de pagar, u organizador en cualquier momento antes de `delivered`) corre una transacción inversa que hace `increment(+quantity)` sobre `stockRemaining` y, si el ítem estaba `outOfStock` únicamente por ese motivo, lo vuelve a `active`.
4. **Agotado manual**: el Menu Manager puede fijar `status = 'outOfStock'` sin tocar el contador (ej. se acabó el hielo aunque el sistema diga que quedan 12 sodas) — es un campo independiente del contador, exactamente para separar "lo que el sistema cree que hay" de "lo que hay en la realidad".
5. **Escala / documento caliente**: `concessionsCatalog/{itemId}` puede recibir muchas transacciones concurrentes si un ítem es muy popular (ej. apertura de barra con 300 invitados a la vez). Firestore reintenta transacciones en conflicto automáticamente; para el volumen esperado (decenas de pedidos por minuto en un evento típico) esto es suficiente sin cambios. Si en el futuro se atiende un evento masivo con una ráfaga sostenida de >1 escritura/seg a un mismo ítem, la mitigación estándar es un **contador distribuido** (shards de `stockRemaining` sumados en lectura) — se documenta como optimización futura, no se construye en el MVP por no tener evidencia de que haga falta (ver §16).

---

## 12. Casos borde

| # | Caso | Mitigación |
|---|---|---|
| 1 | Dos personas comprando el último producto | Transacción atómica en checkout (§11.2): la segunda transacción relee `stockRemaining`, lo ve en 0 o insuficiente, y falla con un error específico que el cliente traduce a "Ya no queda suficiente stock, ajusta tu pedido" — el carrito se recalcula con la cantidad real disponible. |
| 2 | Pagos duplicados (invitado sube comprobante dos veces) | El botón "Subir comprobante" desaparece en cuanto `paymentPhase !== 'awaiting_payment'` (regla de rules además lo bloquea server-side: `resource.data.paymentPhase in ['awaiting_payment','rejected']` es precondición del `update`). |
| 2b | Organizador confirma el mismo pedido dos veces (doble clic) | Guard idéntico al de `setGuestPaymentStatus` hoy: la transacción de confirmación relee el pedido y si `paymentPhase` ya es `confirmed`, no vuelve a incrementar nada ni a duplicar el paso a `queued`. |
| 3 | Carrito abandonado (nunca llega a checkout) | Costo cero: el carrito nunca tocó Firestore. No hay nada que limpiar. |
| 3b | Pedido creado (`awaiting_payment`) y nunca pagado | Sigue reservando stock hasta que alguien actúe. Ver decisión abierta §14.1: barrido manual del organizador vs. automático por cron. |
| 4 | Producto eliminado mientras alguien está comprando | Los productos nunca se hacen `delete` real, solo `archived` (§4.2). La transacción de checkout revalida `status === 'active'` con el documento fresco — si el organizador lo archivó un segundo antes, el checkout falla con "Este producto ya no está disponible" en vez de crear un pedido fantasma. Pedidos ya creados guardan `nameSnapshot`/`unitPriceMinorUnitsSnapshot`, así que archivar un ítem nunca corrompe pedidos históricos. |
| 5 | Comprobante rechazado | `paymentPhase → 'rejected'` con `rejectionReason` obligatorio; la UI del invitado muestra el motivo y reabre el flujo de subir un nuevo comprobante (`rejected → awaiting_payment` es una transición explícita, no un callejón sin salida). El stock **no** se libera automáticamente en un rechazo (el organizador puede estar dándole al invitado otra oportunidad de pagar) — si el organizador quiere liberar el stock, cancela el pedido explícitamente. |
| 6 | Reembolso | No hay pasarela de pago real (transferencia/efectivo son manuales), así que el "reembolso" ocurre fuera de la app (el organizador le devuelve el dinero al invitado por su cuenta). En el sistema se refleja cancelando el pedido con `cancelReason: 'refunded'`, lo cual libera el stock reservado. |
| 7 | Pedido cancelado | Libera stock reservado (increment inverso) siempre que `fulfillmentStatus !== 'delivered'`. Un pedido ya entregado no se puede "cancelar" (se considera un caso de reembolso/nota manual, no de reversión de inventario ya consumido). |
| 8 | Invitado expulsado del evento (`deleteGuest`) | Punto de integración necesario: extender `deleteGuest` (`src/firebase/guests.ts`) para que, al borrar un invitado, cancele también sus pedidos de concessions no entregados (libera stock) y deje los ya entregados como están (historial). Es un cambio aditivo de bajo riesgo sobre una función existente, no un rediseño. |
| 9 | Cambio de precio después de agregar al carrito | El carrito local guarda `itemId` + cantidad, no el precio. El precio final siempre se resuelve en el momento del checkout contra el documento real (§11.2). Si cambió, el invitado ve el precio actualizado en el resumen antes de confirmar — nunca paga un precio "congelado" que ya no es el vigente, ni el organizador cobra de menos por un precio viejo. |
| 10 | Evento cancelado / eliminado | Debe engancharse al flujo existente de cancelación/eliminación de evento (cascada) para marcar todos los pedidos no entregados como `cancelled` con `cancelReason: 'event_cancelled'`. Se marca como punto de integración a resolver en implementación, no como parte nueva de la cascada — se sigue el patrón que ya exista ahí. |
| 11 | Múltiples dispositivos abiertos con el mismo invitado | El carrito es local por dispositivo (no se sincroniza entre pestañas/teléfonos) — es una limitación consciente para evitar otro documento con listeners de alta frecuencia por invitado. Si el invitado ya tiene un pedido en curso (`awaiting_payment`/`proof_submitted`) y abre el menú desde otro dispositivo, la UI lo detecta (mismo query que alimenta "Mis pedidos") y le ofrece **retomar** ese pedido en vez de dejarlo armar uno nuevo en paralelo — mitiga duplicados sin necesitar sincronizar el carrito en sí. |
| 12 | Invitado sin cuenta vinculada, dos QR/lockTokens distintos (multi-dispositivo real, no multi-pestaña) | Se reutiliza el mismo mecanismo de identidad que ya resuelve esto para `guests/{guestId}` ([[project_multidevice_guest_lock_v1]]) — el `guestId` es el mismo documento sin importar desde qué `lockToken` se accedió, así que "Mis pedidos" siempre resuelve al mismo invitado. |
| 13 | Pedido con ítems gratis y de pago mezclados | Un solo pedido, un solo total (solo las líneas con costo suman). Ver §5. |
| 14 | Organizador desactiva el módulo (`concessions.enabled = false`) con pedidos en curso | Los pedidos existentes no se tocan (siguen siendo documentos válidos, el Menu Manager simplemente deja de tener acceso porque la regla exige `concessionsEnabled()`). Recomendación de producto: la UI debería advertir "tienes N pedidos sin entregar" antes de dejar desactivar, pero no es un requisito de seguridad de datos, es UX — se deja como nota, no como bloqueo obligatorio de v1. |

---

## 13. Tiempo real (listeners)

Mismo patrón que el resto del repo, sin excepciones nuevas:

- `subscribeToConcessionsCatalog(eventId, cb, onError)` → `onSnapshot` simple sobre la colección completa (chica), envuelto en `withListenerReporting('concessions.catalog', onError)`.
- `subscribeToGuestOrders(eventId, guestId, cb, onError)` → query por `guestId` para "Mis pedidos" del invitado — listener que vive mientras el GuestPass está montado, se desmonta igual que el resto.
- `subscribeToFulfillmentQueue(eventId, cb, onError)` → query sobre `concessionsFulfillment` con `fulfillmentStatus in ['queued','preparing','ready']`, es el único listener que necesita la pantalla del Menu Manager — nunca se suscribe a `concessionsOrders`.
- `subscribeToPendingPaymentOrders(eventId, cb, onError)` → para la bandeja del organizador, query sobre `concessionsOrders` con `paymentPhase in ['proof_submitted','awaiting_payment']`.

Ningún listener nuevo es "por invitado individual desde el lado del organizador" (evita N listeners para N invitados) — todo son queries de colección con filtros, igual criterio que ya usa `subscribeToGuests`.

---

## 14. Riesgos y decisiones abiertas

### 14.1 ¿Qué hacer con pedidos `awaiting_payment` que nunca se pagan?

El usuario **eliminó explícitamente** el sistema de holds/cronómetro/expiración que existía para el pago de entrada ([[project_remove_reservation_hold_v1]]) porque no quería esa complejidad ("capacity ahora informativo"). Para concessions la situación es distinta en un punto importante: la capacidad de un evento es un límite administrativo/blando, pero el stock de un producto físico (50 sodas) es un límite real — si se "sobrevende" por no liberar reservas viejas, alguien físicamente se queda sin su pedido.

**Recomendación**: no reintroducir un cronómetro automático de expiración en v1 (mismo espíritu que la decisión anterior del usuario). En su lugar, dar al organizador un botón manual explícito ("Cancelar pedidos pendientes de más de X horas") en el panel de Pedidos — mantiene control humano, sin sorpresas automáticas, y resuelve el problema real (stock atascado) sin repetir el patrón que el usuario ya rechazó. Si en producción se ve que esto genera fricción operativa real, la Fase 3 (§15) puede automatizarlo con el mismo cron de GitHub Actions que ya usa el proyecto — es un cambio aislado, no estructural.

### 14.2 ¿El Menu Manager necesita cuenta de Firebase Auth o alcanza con un link?

Se recomienda cuenta real (ver §8.2) por estabilidad de sesión y porque las Security Rules necesitan un UID verificable. Si el volumen de "encargados" es muy alto y rotan mucho (ej. personal contratado por evento, un solo uso), esto puede sentirse pesado. Si eso resulta ser el caso real, una alternativa futura es un modo "link de un solo uso con PIN" análogo al acceso de invitado — pero se dejaría para una iteración posterior, después de validar con el evento real "Baile Improvisado" si el encargado es alguien de confianza con cuenta estable o personal rotativo.

### 14.3 Subida de comprobante con foto

Es la primera vez que Cloudinary se usa para esto en el repo (hoy el pago de entrada es solo texto). Riesgo menor: hay que decidir si el preset de subida debe ser el mismo "unsigned upload preset" que ya se usa para fotos de portada/perfil o uno dedicado con reglas de tamaño/formato propias (comprobantes suelen ser capturas de pantalla, no fotos — pueden pesar distinto). Recomendación: preset dedicado (`concessions_proof`) aunque reutilice el mismo flujo de `uploadImage()`, para poder ajustar compresión/tamaño máximo sin afectar fotos de portada.

### 14.4 Colisión conceptual "Menú" (RSVP) vs "Menú" (compras)

Resuelto a nivel de código (§1), pero de cara al usuario ambas secciones dentro del mismo GuestPass se llamarán "Menú" si el evento usa las dos features a la vez (ej. una boda con selección de plato de banquete Y venta de bebidas). Recomendación de copy: si ambas están activas en el mismo evento, titular la nueva sección como "Barra" / "Menú de compras" / lo que el organizador configure en `storeName`, y dejar "Menú" a secas solo para la sección de RSVP existente — a decidir con el usuario al diseñar el copy final, no bloquea la arquitectura.

---

## 15. Plan de implementación por fases

**Fase 0 — Fundaciones de datos (sin UI visible)**
- Tipos TS (`ConcessionsConfig`, `ConcessionItem`, `ConcessionOrder`, `ConcessionFulfillment`).
- Security Rules + `firestore.indexes.json`.
- `src/firebase/concessions.ts`: CRUD de catálogo, `createOrder` (transacción de checkout), `confirmOrderPayment`, `rejectOrderPayment`, `cancelOrder`, `updateFulfillmentStatus`, y los 4 `subscribeToX` de §13.
- Nuevo permiso `manageConcessions` en `coOrganizerPermissions.ts`.
- Sin exponer ninguna pantalla todavía — se valida con el emulador de Firestore (`npm run test:firebase`), siguiendo [[feedback_no_prod_firebase_smoke_tests]].

**Fase 1 — Panel de organizador**
- Pestaña "Menú" en `EventDetail`: alta/edición de catálogo (con foto vía Cloudinary), configuración del módulo (§6), alta/baja de Menu Managers.
- Bandeja de pedidos con confirmar/rechazar/cancelar.
- Gate de `concessions.enabled` solo editable por `isAdmin()` (§7) — en esta fase el propio usuario (admin) se autohabilita el módulo en su evento piloto.

**Fase 2 — Experiencia del invitado**
- Sección "Menú" (nombre visible) en `EventInformationPanel` (`sections/ConcessionsSection.tsx`, siguiendo el patrón de `null` si no hay catálogo).
- Carrito local + checkout (transferencia/efectivo) + subida de comprobante.
- "Mis pedidos" con estado en tiempo real.

**Fase 3 — Ruta del Menu Manager**
- Ruta dedicada `/events/:eventId/kitchen`, gateada por `concessionsStaffMap`.
- Cola de pedidos + cambio de estado + marcar agotado manual.

**Fase 4 — Piloto real en "Baile Improvisado"**
- Validación end-to-end con el evento real del usuario (Soda italiana + Café frío, ambos de pago).
- Ajustar copy, revisar si hace falta el barrido manual de pedidos abandonados (§14.1) según el comportamiento real de los invitados.

**Fase 5 — GA (apertura pública)**
- Relajar la condición de `isAdmin()` en §7 a `canDo(eventId, 'manageConcessions', false)`.
- Sin cambios de esquema ni migración — es literalmente cambiar una condición en `firestore.rules`.

---

## 16. Qué se reutiliza vs. qué se construye nuevo

| Reutilizado tal cual | Extendido | Construido nuevo |
|---|---|---|
| `PaymentMethod` (`'transfer'\|'cash'`) | `uploadImage()`/Cloudinary → nuevo preset para comprobantes | `ConcessionsConfig`, `ConcessionItem`, `ConcessionOrder`, `ConcessionFulfillment` |
| `EventData.paymentInstructions` (con flag de reuso) | `CoOrganizerPermissions` (+1 permiso) | Rol Menu Manager y su ruta dedicada |
| `useEventPermissions` / `canDo()` / `isAdmin()` | `deleteGuest` (cancelar pedidos huérfanos, §12 caso 8) | Transacción de checkout con reserva de inventario |
| Patrón `runTransaction` + `increment()` | Cascada de cancelación/eliminación de evento (§12 caso 10) | Máquina de estados de pedido (`paymentPhase`/`fulfillmentStatus`) |
| Patrón `subscribeToX` + `withListenerReporting` | | Separación `concessionsOrders`/`concessionsFulfillment` (nuevo caso de este patrón, no existía para dos colecciones "hermanas" fuera de `guests`/`guestContacts`) |
| `EventInfoSection`/`EventInformationPanel` (composición por línea) | | Script de barrido de pedidos abandonados (Fase 3+, condicionado a §14.1) |

---

## 17. Resumen de impacto (para decisión rápida)

- **Cloud Functions nuevas**: 0.
- **Costo de infraestructura adicional**: 0 (mismo plan Spark; el único costo variable es Cloudinary por las fotos de comprobante, ya presupuestado como servicio existente).
- **Colecciones nuevas**: 3 subcolecciones por evento (`concessionsCatalog`, `concessionsOrders`, `concessionsFulfillment`), todas opcionales/vacías si el módulo no está activo.
- **Riesgo de romper algo existente**: bajo. Todos los campos son aditivos; el único touchpoint sobre código existente es extender `deleteGuest` y la cascada de cancelación de evento (ambos cambios aislados y de bajo riesgo).
- **Bloqueador real**: ninguno técnico. Las dos decisiones que sí requieren tu criterio de producto antes de construir están en §14.1 (barrido de pedidos abandonados) y §14.2 (tipo de acceso del Menu Manager) — el resto del documento no depende de esas respuestas para empezar la Fase 0.
