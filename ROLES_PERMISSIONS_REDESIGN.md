# Rediseño del sistema de roles y permisos: auditoría y arquitectura propuesta

Fecha: 2026-08-12. Alcance: modelo de datos de colaboradores, `firestore.rules`, `functions/src/lib/permissions.ts`, `useEventPermissions`/`resolveEventPermissions`, navegación por rol.

**No se hizo ningún cambio de código en este documento** — es diagnóstico y propuesta de arquitectura, igual que las auditorías previas del proyecto (`BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md`, `FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md`).

## 0. Resumen ejecutivo

PaseLink tiene hoy **tres sistemas de rol paralelos y no unificados**, cada uno con su propio mapa dentro del documento del evento:

| Sistema | Dónde vive | Alcance | Invitación |
|---|---|---|---|
| Coorganizador | `event.coOrganizersMap` + `event.coOrganizerPermissions` (17 booleanos) | Amplio: invitados, check-in, pagos, evento, muro, reportes, mesas, coorganizadores | `/co/:eventId/:token` (Cloud Function propia) |
| Staff de ventas | `event.concessions.concessionsStaffMap` (`cashier`/`prep`) | Aislado: solo catálogo/pedidos/pagos de ventas | `/menu-staff/:eventId/:token` (Cloud Function propia) |
| Admin de plataforma | Custom claim `admin` + doc `admins/{uid}` | Global, no por evento | N/A (alta manual en consola) |

La buena noticia: la seguridad de las acciones más sensibles (check-in, confirmar pago, pedidos con dinero) **ya está migrada a Cloud Functions** con revalidación server-side — no es un caso de "solo se oculta el botón en React". El patrón de staff de ventas (rol por invitación con enlace/QR, mapa aislado, sin acceso a nada más) es, estructuralmente, el prototipo correcto que se pidió para Caja/Preparación — ya existe, solo vive fuera del sistema general de coorganizador.

El problema no es de seguridad activa, es de **fragmentación**: el mismo criterio de autorización está triplicado a mano (rules, `functions/src/lib/permissions.ts`, frontend), ya hay un drift real detectado, no existe rol de Recepción separado del acceso amplio de coorganizador, y un colaborador que solo tiene rol de ventas no aparece en su propio `/dashboard`.

Este documento propone unificar los tres sistemas en un solo modelo `event.collaborators: Record<uid, CollaboratorEntry>`, con un catálogo único de permisos atómicos y roles como presets sobre ese catálogo, sin romper el acceso de ningún colaborador existente.

## 1. Estado actual (auditoría)

### 1.1 Modelo de datos

- `EventData.ownerId: string` (`src/types/index.ts:322`) — dueño único, nunca es "colaborador".
- `EventData.coOrganizersMap?: Record<uid, email>` (`src/types/index.ts:531`).
- `EventData.coOrganizerPermissions?: Record<uid, CoOrganizerPermissions>` (`src/types/index.ts:536`).
- `CoOrganizerPermissions` (`src/types/coOrganizerPermissions.ts:7-40`) — **17 permisos booleanos**: `addGuests`, `editGuests`, `deleteGuests`, `shareInviteLink`, `confirmPayments`, `scanQr`, `viewGuestList`, `postWall`, `moderateWall`, `editEvent`, `manageCoOrganizers`, `viewReports`, `exportLists`, `downloadEventInfo` (reservado, sin función que lo consuma todavía), `manageSeating`, `viewLiveDashboard`, `manageConcessions`.
- `LEGACY_COORG_DEFAULTS` (`coOrganizerPermissions.ts:52-74`) — todo `true` salvo `editEvent`, `manageCoOrganizers`, `manageConcessions`. **Triplicado a mano**: el propio archivo advierte que estos valores están espejados como literales en `firestore.rules` (`coOrgPerm`), y además `functions/src/callable/createCoOrganizerInvite.ts:25-43` define su propia copia (`INVITE_DEFAULT_PERMISSIONS`) — **drift ya real**, no hipotético: son tres literales sincronizados solo por comentario.
- `EventData.concessions.concessionsStaffMap?: Record<uid, ConcessionsStaffEntry | string>` (`src/types/concessions.ts:50`) — shape `{ email, roles: { cashier, prep } }`, con soporte de un shape legado (`string` = solo email, resuelto como solo-preparación). Explícitamente documentado como "no es un coorganizador... sin acceso a guests/reportes/configuración del evento" (`concessions.ts:39-49`).
- `users/{uid}` no tiene ningún campo de rol (`src/types/index.ts:893-907`, `UserProfile`). El único rol de plataforma vive en `admins/{uid}` + custom claim `admin`, sincronizado por `functions/src/triggers/onAdminWritten.ts`.
- No existe ningún campo de staff propio para Seating Chart o "Anfitrión en Vivo" — ambos reutilizan permisos de `CoOrganizerPermissions` (`manageSeating`, `viewLiveDashboard`). No hay concepto de "Historias" con permisos propios (`StoriesBar.tsx` es cosmético).

### 1.2 Resolución de permisos (frontend)

`resolveEventPermissions(event, uid)` (`coOrganizerPermissions.ts:145-163`) es el único punto de verdad para el sistema de coorganizador: dueño → `FULL_ACCESS`; uid en `coOrganizersMap` → merge de `LEGACY_COORG_DEFAULTS` con `coOrganizerPermissions[uid]`; si no → `NO_ACCESS`. Expuesto vía `useEventPermissions(event, user)` (`src/hooks/useEventPermissions.ts:10-15`) y usado consistentemente en `EventDetail.tsx`, `Scanner.tsx`, `GuestPass.tsx`, `EventWall.tsx`, `Reports.tsx`, `SeatingChart.tsx`, `ConcessionsManager.tsx`.

**Pero no conoce `concessionsStaffMap`.** `ConcessionsKitchen.tsx:34-35` es el único lugar del proyecto donde convergen los tres sistemas en una sola condición: `isConcessionsCashier(staffMap, uid) || perms.manageConcessions || isAdmin`. Es exactamente la fricción que este rediseño debe resolver.

### 1.3 Backend — Cloud Functions

`functions/src/lib/permissions.ts` reimplementa el mismo criterio que `canDo()`/`coOrgPerm()` de rules — **tercera copia** del mismo cálculo. Funciones: `canManageGuests`, `canConfirmPayments`, `canScanQr`, `canEditGuests`, `canManageConcessions`, `canManageCoOrganizers`, más `isConcessionsCashier`/`isConcessionsPrep` (leen `concessionsStaffMap` directo, sin pasar por `coOrganizerPermissions`).

Callables que sí validan permiso server-side: `checkInGuest`, `checkOutGuest`, `confirmPaymentAndCheckIn`, `setGuestPaymentStatus`, `bulkSetGuestPaymentStatus`, `allowGuestReentry`, `addGuest`, `addGuestsBulk`, callables de waitlist, `createCoOrganizerInvite`, `createConcessionsStaffInvite`, `cancelConcessionOrder`, `deleteConcessionOrder`.

Escrituras directas de cliente **sin** Callable equivalente (protegidas solo por rules, que es backend real pero es la tercera copia del criterio): `updateCoOrganizerPermissions`, `removeCoOrganizer`, `leaveCoOrganizer` (`src/firebase/events.ts:340-368`); todo el catálogo/config de concesiones y `removeConcessionsStaff` (`src/firebase/concessions.ts`); confirmar/rechazar pago de pedido de concesiones; edición del evento (`updateEventDetails`); moderación del muro (`src/firebase/wall.ts`).

Gap conocido y ya documentado: ninguna Callable de `guests` tiene bypass explícito de `isAdmin()` (un admin de soporte no puede confirmar pagos ni hacer check-in vía Callable, solo dueño/coorganizador con permiso) — no es parte del alcance de roles, pero conviene resolverlo en la misma pasada si se toca `permissions.ts`.

### 1.4 Firestore Rules

Patrón dominante: mapa dentro del propio doc del evento, resuelto con `get()`/`exists()` — **no** custom claims, excepto `isAdmin()`.

- `canDo(eventId, key, def)` (rules:37-39) = `isOwner(eventId) || (isCoOrganizer(eventId) && coOrgPerm(eventId, key, def))` — "único punto de la app" que decide autorización de coorganizador, según su propio comentario.
- Variantes `*Data` (`isOwnerData`, `isCoOrganizerData`, `coOrgPermData`, `canDoData`, rules:55-71) existen específicamente para evitar `get()` repetidos — motivadas por el límite real de 1000 expresiones de Firestore, que este archivo **ya golpeó dos veces en producción** (documentado en rules:41-54 y rules:1238-1249).
- Concesiones tiene su propio juego de helpers, totalmente separado: `concessionsStaffEntry`, `isConcessionsStaffMember`, `isConcessionsCashier`, `isConcessionsPrep` (rules:685-703) — leen `concessions.concessionsStaffMap`, nunca `coOrganizerPermissions`.
- 13 permisos de `coOrganizerPermissions` se usan realmente en rules vía `canDo`/`canDoData` (`viewGuestList`, `deleteGuests`, `addGuests`, `editGuests`, `manageSeating`, `scanQr`, `confirmPayments`, `manageConcessions`, `manageCoOrganizers`, `postWall`, `moderateWall`, `editEvent`, `viewReports`) — el listado completo con línea exacta queda en el hallazgo del agente de rules (disponible en la sesión de origen si se necesita releer).
- Las dos subcolecciones de invitación (`coOrganizerInvites`, `concessionsStaffInvites`) son `allow read, write: if false` — completamente ilegibles/inescribibles desde cliente, solo Admin SDK vía Callable. Este patrón (token = única barrera, subcolección bloqueada a rules) es exactamente el que debe generalizarse.

### 1.5 Frontend — navegación y guards

- **No existe sidebar ni menú condicional por rol.** `BottomTabBar.tsx`/`Navbar.tsx` son fijos (Inicio/Invitaciones/Perfil) para cualquier usuario autenticado. Toda la adaptación por rol de coorganizador ocurre como botones condicionales *dentro* de `EventDetail.tsx`, no como una navegación separada.
- Cada página de destino (`Scanner`, `Reports`, `SeatingChart`, `ConcessionsManager`) repite su propio guard de `perms.*` — no hay guard centralizado por rol a nivel de router. `ProtectedRoute` solo verifica sesión + sanción, no conoce roles de evento.
- **Bug real, no solo carencia de diseño**: `subscribeToUserEvents` (`src/firebase/events.ts:141-172`) solo busca `ownerId` o `coOrganizersMap` — un colaborador que **solo** tiene rol de ventas (`concessionsStaffMap`) no ve su evento en `/dashboard`. Su único camino de vuelta es reabrir el link/QR de invitación original.
- No hay redirect inicial por rol dominante (ej. ir directo a `/kitchen` si el único permiso es preparación) — pedido explícito de la sección 22 del ticket original, hoy inexistente.
- Las pantallas de aceptación de invitación (`AcceptCoOrganizerInvite.tsx`, `AcceptConcessionsStaffInvite.tsx`) explican el rol en términos generales pero **no listan los permisos concretos** que va a recibir el colaborador antes de aceptar.

## 2. Arquitectura propuesta

### 2.1 Modelo de datos unificado

Reemplaza `coOrganizersMap` + `coOrganizerPermissions` + `concessionsStaffMap` por un solo campo:

```ts
type CollaboratorRole =
  | 'administrador'
  | 'recepcion'
  | 'caja'
  | 'ventas'
  | 'preparacion';
  // 'comunidad' evaluado, no incluido en v1 — ver §5

interface CollaboratorEntry {
  email: string;
  role: CollaboratorRole;
  permissionOverrides?: Partial<PermissionSet>; // excepciones puntuales, opcional
  invitedBy: string;   // uid de quien invitó
  invitedAt: Timestamp;
}

// event.collaborators: Record<uid, CollaboratorEntry>
```

`ownerId` no cambia — el dueño nunca es una entrada de `collaborators`, sigue siendo la autoridad máxima fuera del sistema de roles (igual que hoy).

### 2.2 Catálogo único de permisos atómicos

Un solo archivo (`src/types/permissions.ts` o equivalente), fuente de verdad **compartida** — no triplicada — entre frontend, `functions/src/lib/permissions.ts` y la generación/documentación de `firestore.rules`. Reusa los nombres ya existentes donde ya existen, para minimizar la migración:

```
event.read · event.update · event.delete
guests.read · guests.create · guests.update · guests.delete · guests.manageSeating · guests.manageWaitlist
checkin.scan
payments.read · payments.confirm
catalog.read · catalog.manage
sales.read
orders.read · orders.prepare · orders.cancel
collaborators.read · collaborators.invite · collaborators.updateRole · collaborators.remove
wall.post · wall.moderate
reports.read · reports.export
liveDashboard.read
```

Nota de diseño: `catalog.manage` conserva el alcance actual de `manageConcessions` (crear/editar/eliminar/disponibilidad) sin partirlo — partir catálogo de disponibilidad exigiría separar el formulario de producto, igual que `editEvent` ya quedó colapsado en v1 del sistema de coorganizador por la misma razón (`EditEventForm` es un solo write atómico).

### 2.3 Roles como presets

| Rol | Permisos concedidos | Basado en |
|---|---|---|
| **Administrador** | Todos excepto `event.delete`, `collaborators.remove` sobre el dueño, transferencia de ownership | `LEGACY_COORG_DEFAULTS` actual, menos gaps de ownership |
| **Recepción** | `guests.read`, `checkin.scan`, `payments.read` (confirmar pago vía override opcional, no por defecto — ver más abajo) | Subconjunto nuevo de `CoOrganizerPermissions` |
| **Caja** | `payments.read`, `payments.confirm`, `orders.read` | `concessionsStaffMap.cashier` actual, 1:1 |
| **Ventas** | `catalog.read`, `catalog.manage`, `sales.read`, `orders.read` | `manageConcessions` actual |
| **Preparación** | `orders.read`, `orders.prepare` | `concessionsStaffMap.prep` actual, 1:1 |

**Decisión de diseño sobre Recepción y pagos**: el pedido original describe Recepción como capaz de "marcar invitados como pagados cuando corresponda" con un ⚠️ en la matriz sugerida — no como acceso incondicional. Se modela como `permissionOverrides: { 'payments.confirm': true }` opcional por colaborador, no como parte del preset base de Recepción — evita que todo evento con Recepción exponga confirmación de pago si el anfitrión no lo quiere (ej. eventos donde el pago se cobra aparte en Caja).

**Rol Comunidad**: descartado en la v1 de esta propuesta por decisión explícita, luego implementado en la Fase 5 (2026-08-13) a pedido del usuario. Preset: únicamente `moderateWall`+`postWall`.

**Fotógrafo/Historias, Moderador, Analista/Reportes, Staff general**: no se recomienda implementar ninguno en esta iteración. No hay superficie de producto de "Historias" con permisos propios que proteger (`StoriesBar` es cosmético); un rol "Analista" sería un subconjunto de un solo permiso (`reports.read`) sin urgencia declarada; "Staff general" es demasiado ambiguo para ser un preset con significado — mejor resuelto con `permissionOverrides` puntuales sobre un rol existente si aparece un caso real.

### 2.4 Matriz de permisos final

| Permiso | Dueño | Administrador | Recepción | Caja | Ventas | Preparación |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| event.update / event.settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| event.delete | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| guests.read | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| guests.create/update/delete | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| guests.manageSeating | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| checkin.scan | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| payments.read | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| payments.confirm | ✅ | ✅ | ⚠️ override | ✅ | ❌ | ❌ |
| catalog.read | ✅ | ✅ | ❌ | ⚠️ solo lo necesario para cobrar | ✅ | ✅ (solo lectura de producto/cantidad) |
| catalog.manage | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| sales.read (historial) | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| orders.read | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| orders.prepare (marcar entregado) | ✅ | ✅ | ❌ | ❌ | ⚠️ opcional | ✅ |
| collaborators.invite/updateRole/remove | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| wall.post | ✅ | ✅ | ✅ (como cualquier asistente) | ✅ | ✅ | ✅ |
| wall.moderate | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| reports.read / export | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| liveDashboard.read | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

Principio aplicado consistentemente: Preparación nunca ve `payments.*` (la validación financiera es responsabilidad exclusiva de Caja, tal como se pidió explícitamente); Caja nunca ve `catalog.manage`/`guests.*`; Recepción nunca ve `catalog.*`/`collaborators.*`.

### 2.5 Invitaciones unificadas

Una sola Cloud Function `createCollaboratorInvite(eventId, role, permissionOverrides?)` / `acceptCollaboratorInvite(token)`, reemplazando las dos parejas actuales (`create/acceptCoOrganizerInvite`, `create/acceptConcessionsStaffInvite`). Una sola subcolección `events/{id}/collaboratorInvites/{token}`, mismo patrón de bloqueo total a cliente (`allow read, write: if false`) que ya usan las dos subcolecciones actuales.

Reglas ya vigentes que se conservan sin cambio de criterio:
- Tope de invites pendientes por evento (hoy 20 para cada sistema, unificar en un solo tope de 20 colaboradores totales).
- Anti-auto-escalada: `acceptCoOrganizerInvite` hoy ya bloquea que alguien se asigne a sí mismo `manageCoOrganizers` fuera del flujo de invitación — el mismo criterio se aplica: nadie puede invitar a un rol con más permisos de los que el propio invitador tiene (`collaborators.invite` no implica poder otorgar `event.delete` u ownership, que no son parte del catálogo de colaborador en absoluto).
- Idempotencia si el invitado ya es dueño/colaborador (ya implementado en `acceptCoOrganizerInvite`, se porta igual).

Mejora sobre el estado actual: la pantalla de aceptación pasa a listar los permisos concretos del rol (pedido explícito, sección 24 del ticket original) — hoy ninguna de las dos pantallas lo hace con el detalle pedido.

### 2.6 Backend

`functions/src/lib/permissions.ts` se generaliza a una función única `hasPermission(event, uid, permission)` que resuelve, en orden: dueño → `true`; admin de plataforma → `true` (bypass hoy ausente en varias Callables, se agrega de forma consistente en la misma pasada); colaborador → `role` preset + `permissionOverrides`. Cada Callable pasa a llamar `hasPermission(event, uid, 'guests.create')` en vez de una función dedicada (`canManageGuests`) por permiso — mismo comportamiento, una sola implementación.

### 2.7 Firestore Rules

Mismo patrón que hoy (`canDo`/`canDoData`, con las variantes `*Data` conservadas por el límite de 1000 expresiones ya confirmado en producción), adaptado a un solo mapa `collaboratorPermissions` derivado de `collaborators[uid].role` + overrides, en vez de leer `coOrganizerPermissions` y `concessionsStaffMap` por separado. Los helpers `isConcessionsCashier`/`isConcessionsPrep` se retiran una vez que las colecciones de concesiones (`concessionsOrders`, `concessionsFulfillment`, `concessionsCatalog`) pasan a usar `canDo(eventId, 'payments.confirm', ...)`/`canDo(eventId, 'orders.prepare', ...)` sobre el mapa unificado.

### 2.8 Frontend

- `useEventPermissions` se generaliza para leer `collaborators` en vez de tres fuentes separadas — un solo objeto de permisos resultante para cualquier componente, cerrando la mezcla ad-hoc de `ConcessionsKitchen.tsx:34-35`.
- Navegación: `EventDetail.tsx` deja de mostrar siempre los botones "Escanear/Reportes/Muro" y pasa a ocultarlos si el colaborador no tiene el permiso correspondiente (hoy solo Mesas/Ventas/Editar/Coorganizadores están gateados individualmente).
- **Fix de bug independiente del rediseño mayor**: `subscribeToUserEvents` debe incluir eventos donde `uid ∈ collaborators` (no solo `ownerId`/`coOrganizersMap`) — hoy un colaborador de solo-ventas no ve su evento en `/dashboard`.
- Redirect inicial por rol dominante: si el único permiso relevante de un colaborador es `orders.prepare`, aterriza directo en `/kitchen` en vez de `/events/:id` (pedido explícito, sección 22).

## 3. Migración de datos existentes

Sin pérdida de acceso para ningún colaborador actual, sin backfill obligatorio (los mapas legacy se siguen leyendo en paralelo durante la transición, mismo patrón que ya usa `resolveConcessionsStaffEntry` para el shape string legado):

- Cualquier entrada de `coOrganizersMap` → `collaborators[uid] = { role: 'administrador', ... }`. No hay señal suficiente en los booleanos legacy para inferir un rol más angosto (ej. distinguir un coorganizador que en la práctica solo escaneaba QR) — mapear todos a Administrador es la única migración segura; el dueño puede después degradar manualmente a quien corresponda.
- `concessionsStaffMap[uid].roles.cashier === true` → `collaborators[uid] = { role: 'caja', ... }`; `.roles.prep === true` → `{ role: 'preparacion', ... }`; si ambos, se crean dos entradas conceptuales o se modela como `permissionOverrides` agregando los permisos de Preparación sobre el rol Caja — decisión de implementación a definir en la fase correspondiente, no bloqueante para el diseño.
- Shape legado de `concessionsStaffMap` (string = solo email) → `role: 'preparacion'` (mismo criterio que `resolveConcessionsStaffEntry` ya aplica hoy).

## 4. Plan de fases sugerido

Mismo criterio de secuenciación que usó el proyecto para la migración de rules (menor superficie primero, camino crítico en vivo al final, sin downtime):

**Fase 1 — Modelo de datos + resolución (bajo riesgo). ✅ Implementado (2026-08-12), pendiente commitear.** Nuevo archivo `src/types/collaboratorPermissions.ts`: tipos `CollaboratorRole` (5 roles), `CollaboratorEntry` (shape futuro de `event.collaborators[uid]`), `EventCollaboratorPermissions` (extiende `CoOrganizerPermissions` con los 6 permisos granulares nuevos: `viewPayments`, `viewCatalog`, `viewSales`, `viewOrders`, `prepareOrders`, `cancelOrders`), presets por rol (`COLLABORATOR_ROLE_PRESETS`) y `resolveCollaboratorPermissions()` — resuelve en orden dueño → `event.collaborators[uid]` (nuevo, hoy siempre vacío) → `coOrganizersMap`/`coOrganizerPermissions` (legacy) → `concessionsStaffMap` (legacy, aislado) → sin acceso. `NO_ACCESS`/`FULL_ACCESS` de `coOrganizerPermissions.ts` se exportaron (antes internos) para que los presets de rol se construyan sobre esa misma base en vez de repetir los 17 booleanos una cuarta vez. Campo `EventData.collaborators?: Record<uid, CollaboratorEntry>` agregado (opcional, aditivo, sin backfill). `useEventPermissions` migró a `resolveCollaboratorPermissions` — mismo contrato externo (todos los componentes que ya usaban `perms.scanQr`/`perms.isOwner`/etc. siguen compilando y funcionando igual, `CollaboratorPermissions` es un superset estructural de `EventPermissions`). Sin cambio de comportamiento real todavía: como nada escribe a `event.collaborators` hasta la Fase 2, la resolución siempre cae hoy en una rama legacy, con el mismo resultado que cada página calculaba antes a mano (ej. `manageConcessions || confirmPayments` para ver pedidos, ya usado en `ConcessionsManager.tsx`). 12 tests nuevos en `src/types/collaboratorPermissions.test.ts` cubriendo las 5 ramas de resolución, incluida la prioridad de `collaborators` sobre `coOrganizersMap` cuando coexisten y `permissionOverrides` sobre un preset. `tsc -b`, `eslint` (archivos tocados), `npm run test` (182/182) y `npm run build` verdes. **No tocó `firestore.rules` ni `functions/`** (Fase 2/3) ni ningún componente de UI/navegación (Fase 4) — `ConcessionsKitchen.tsx` sigue con su chequeo ad-hoc de `isConcessionsCashier`/`isConcessionsPrep` por ahora, a simplificar en Fase 4 cuando consuma `perms.viewOrders`/`perms.prepareOrders` directo.

**Fase 2 — Backend unificado. ✅ Implementado (parcial, 2026-08-12), pendiente commitear.** `functions/src/lib/permissions.ts` reescrito: las 6 funciones puntuales (`canManageGuests`/`canConfirmPayments`/`canScanQr`/`canEditGuests`/`canManageConcessions`/`canManageCoOrganizers`) y las 2 muertas sin uso real (`isConcessionsCashier`/`isConcessionsPrep`, verificado por grep — `acceptConcessionsStaffInvite.ts` ya reimplementaba esa lógica inline) se reemplazaron por un solo `hasPermission(event, uid, permission, opts?)`, mismo criterio de resolución que `resolveCollaboratorPermissions` del lado cliente (dueño → `event.collaborators` → coorganizador legacy → staff de ventas legacy → sin acceso) — puerto server-side, no import (`functions/` sigue standalone). Los 23 permisos de `CollaboratorPermission` y los presets de rol están duplicados a mano entre `src/types/collaboratorPermissions.ts` y este archivo (mismo patrón de duplicación documentada ya tolerado en el proyecto para `LEGACY_COORG_DEFAULTS`) — no hay forma de compartir código entre `src/` y `functions/` sin un paquete compartido, fuera de alcance de esta fase. Las 18 Callables que ya llamaban a las funciones viejas migraron a `hasPermission()` (`addGuest`, `addGuestsBulk`, `startCsvImport`, `cancelCsvImportJob`, `startReconfirmCampaign`, `cancelWaitlistOffer`, `promoteWaitlistEntry`, `assignWaitlistSpot`, `checkInGuest`, `checkOutGuest`, `confirmPaymentAndCheckIn`, `allowGuestReentry`, `setGuestPaymentStatus`, `bulkSetGuestPaymentStatus`, `cancelConcessionOrder`, `deleteConcessionOrder`, `createCoOrganizerInvite`, `createConcessionsStaffInvite`). **Gap de seguridad real cerrado de paso**: ninguna de estas Callables tenía bypass de admin de plataforma (documentado en `BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md`) — ahora todas pasan `{ isAdmin: request.auth.token.admin === true }`, mismo criterio que `isAdmin()` en `firestore.rules`. **Drift real corregido**: `createCoOrganizerInvite.ts` tenía su propia copia hardcodeada de `LEGACY_COORG_DEFAULTS` (`INVITE_DEFAULT_PERMISSIONS`, ya señalada como duplicación riesgosa en la auditoría) — ahora importa `LEGACY_COORG_DEFAULTS` exportado desde `permissions.ts`. 15 tests nuevos en `functions/src/lib/permissions.test.ts` (lógica pura, sin emulador). `npm run test` (functions, 432/432 con emulador vía `npm run test:functions` desde la raíz), `npm run test:firebase` (292/292, sin regresión — no se tocó `firestore.rules`), `tsc --noEmit`/`lint` en `functions/` y raíz — todo verde.

**Deliberadamente NO implementado en esta fase — se fusiona con la Fase 3**: las Cloud Functions únicas de invitación (`createCollaboratorInvite`/`acceptCollaboratorInvite`). Razón encontrada durante el diseño: aunque `hasPermission()` ya entiende `event.collaborators`, `firestore.rules` todavía NO lo entiende (sigue leyendo solo `coOrganizersMap`/`coOrganizerPermissions`/`concessionsStaffMap`) — un colaborador nuevo-estilo de rol Caja/Ventas/Preparación invitado hoy podría escanear/confirmar pagos vía Callable (ya cubierto), pero fallaría en cualquier lectura directa de Firestore gateada por rules (ej. listar `concessionsOrders`/`concessionsCatalog`), porque esas reglas no reconocen el mapa nuevo todavía. Construir la invitación unificada antes de que rules la entienda dejaría Callables funcionales pero inalcanzables (nada del frontend las llama todavía, eso es Fase 4) o, peor, alcanzables-pero-rotas a medias. Se prefirió no enviar ese riesgo a producción — la Fase 3 combina "rules entienden `collaborators`" + "invitación unificada" en una sola unidad coherente y verificable de punta a punta.

**Fase 3 — Firestore Rules + invitación unificada. ✅ Implementado (2026-08-12), pendiente commitear/deployar.** `firestore.rules`: `coOrgPerm`/`coOrgPermData`/`isCoOrganizer`/`isCoOrganizerData` ahora leen `event.collaborators[uid]` con prioridad sobre los mapas legacy (`coOrganizersMap`/`coOrganizerPermissions`) — nuevas funciones `collaboratorEntry()`, `collaboratorRolePreset()` (cuarta copia manual de los presets de rol, mismo patrón de duplicación ya tolerado en el proyecto) y `collaboratorPermValue()` (resuelve `permissionOverrides` sobre el preset). `isConcessionsStaffMember`/`isConcessionsCashier`/`isConcessionsPrep` también reconocen colaboradores de rol `caja`/`preparacion` del sistema nuevo, además del `concessionsStaffMap` legacy. `eventContentCapsOk()` suma el tope `collaborators.size() <= 20` (paralelo al de `coOrganizersMap`). Nueva subcolección `collaboratorInvites/{token}`, mismo patrón `allow read, write: if false` que las dos legacy. `coOrgPerm`/`isCoOrganizer` se simplificaron para delegar en sus variantes `Data` (antes duplicaban la lógica) — reduce, no suma, duplicación neta del archivo.

Cloud Functions nuevas: `createCollaboratorInvite`/`acceptCollaboratorInvite` (`functions/src/callable/`), mismo patrón que los dos pares legacy (token en subcolección ilegible desde cliente, tope de 20, TTL de 7 días) — un colaborador tiene un único `role` (no se mergean como cashier/prep de concesiones); aceptar una invitación siendo ya colaborador de cualquier tipo es idempotente y NO reemplaza el rol existente (mismo criterio que coorganizador, a diferencia de concesiones). El gate para invitar de cualquier rol sigue siendo `manageCoOrganizers` — no se dividió en permisos `collaborators.invite/updateRole/remove` separados en esta fase (decisión de alcance de Fase 1, se mantiene). `permissionOverrides` del invite se valida contra `COLLABORATOR_PERMISSION_KEYS` (booleanos únicamente, claves conocidas). Registradas en `functions/src/index.ts`, nuevo `BUSINESS_EVENTS.COLLABORATOR_INVITE_ACCEPTED`.

**Tests**: 12 nuevos en `src/firebase/__tests__/collaboratorPermissions.rules.test.ts` (emulador de reglas) cubriendo resolución por rol vía `collaborators`, `permissionOverrides`, prioridad sobre mapas legacy cuando un uid está en ambos, y bloqueo de `collaboratorInvites`. Bug real encontrado y corregido en el PROPIO test (no en las rules): el payload `{name, version, updatedAt}` usado para probar `editGuests` también calzaba con la rama de autoedición del propio invitado (sin gate de rol, solo posesión de `lockToken`) — como el invitado sembrado no tenía `lockTokens`, esa rama pasaba trivialmente para cualquier caller; se corrigió sembrando `lockTokens: ['someone-elses-device']` para forzar el paso exclusivo por la rama de `editGuests`. 11 tests nuevos en `functions/src/callable/collaboratorInvite.test.ts` (primer test directo de un flujo de invitación de colaborador en el proyecto — ninguno de los 4 Callables legacy de invitación tenía cobertura propia). `test:firebase` 304/304 (292 previos + 12), `test:functions` 443/443 (432 previos + 11), `tsc`/`lint`/`build` en raíz y `functions/` — todo verde.

Deploy en orden cuando se lleve a producción: rules primero (aditivo, no quita nada todavía) → Cloud Functions nuevas → confirmar en producción → recién entonces retirar `coOrgPerm`/`concessionsStaffEntry` legacy de rules (ver Fase 6). El frontend NO llama todavía a `createCollaboratorInvite`/`acceptCollaboratorInvite` (eso es Fase 4) — las Callables existen y están probadas, pero inertes hasta que se conecten a la UI.

**Fase 4 — Frontend. ✅ Implementado (2026-08-12), pendiente commitear/deployar.** `subscribeToUserEvents` (`src/firebase/events.ts`) agrega un tercer listener (`where('collaborators.\${uid}', '!=', null)`) — antes de esto, un colaborador de rol angosto no aparecía en `/dashboard` en absoluto. `EventDetail.tsx`: el callejón sin salida `if (user && !perms.hasAccess) return <ErrorFallbackCTA .../>` pasó a un redirect real (`<Navigate replace />`) según el permiso que sí tiene el colaborador — preparación/caja → `/kitchen`, ventas → `/menu`, recepción → `/scan`, con `ErrorFallbackCTA` solo como último recurso. Los botones "Escanear pases"/"Reportes" ahora se ocultan individualmente (`perms.scanQr`/`perms.viewReports || perms.viewLiveDashboard`) en vez de mostrarse siempre para cualquiera con `hasAccess` — Muro queda sin gate a propósito (destino público, es solo un atajo).

Nuevo `src/firebase/collaboratorInvites.ts` (wrappers de las 2 Callables de Fase 3) + `src/hooks/useCollaborators.ts` + `src/components/CollaboratorPanel.tsx`: el anfitrión elige un rol de un selector (no un conjunto de permisos sueltos) y genera enlace/QR — mismo patrón visual que `CoOrganizerPanel.tsx`, agregado como sección **adicional** en `EventDetail.tsx` (ícono `IconShield` junto al de coorganizadores), no como reemplazo: los paneles legacy de coorganizador/staff de ventas siguen intactos y gestionando lo que ya tenían. El panel nuevo también lista los colaboradores ya agregados (email + rol) con botón de quitar — cambiar el rol de alguien ya aceptado queda fuera de esta fase (hay que revocar y volver a invitar).

`src/pages/AcceptCollaboratorInvite.tsx` (ruta `/collab/:eventId/:token`) — a diferencia de las dos pantallas legacy, SÍ muestra la lista concreta de permisos antes de aceptar (pedido explícito §24). Como el documento de la invitación es ilegible desde el cliente, el rol viaja como query param puramente informativo (`?role=`, generado por `buildCollaboratorInviteUrl`) — `acceptCollaboratorInvite` en el servidor nunca lo usa, solo lee el `role` real guardado en la invitación; alguien que edite la URL a mano solo vería texto informativo incorrecto, nunca obtiene un rol distinto.

`ConcessionsKitchen.tsx` simplificado (deuda marcada explícitamente al cerrar la Fase 1): `canCashier`/`canPrep` pasaron de leer `concessionsStaffMap` directo (`isConcessionsCashier`/`isConcessionsPrep`, ciego a `event.collaborators`) a leer `perms.confirmPayments`/`perms.prepareOrders` — que `resolveCollaboratorPermissions` ya resuelve correctamente para los 3 sistemas (legacy staff map, coorganizador, y el nuevo `collaborators`). `isConcessionsCashier`/`isConcessionsPrep` (`src/types/concessions.ts`) quedaron sin ningún llamador tras esto — se borraron (detectado con `knip`, no solo por inspección).

**Extensión de `firestore.rules` necesaria y no anticipada en el plan original**: sin esto, el panel nuevo no tenía forma de escribir. Se generalizaron las ramas "salir del evento"/"administrar co-organizadores" de `events/{eventId}` `allow update` para también reconocer `collaborators` (nueva rama de "salir" para el mapa nuevo, `hasOnly` extendido en la rama de "administrar", mismo guard anti-autoescalada ya usado para `coOrganizersMap`).

**Bug real encontrado y corregido durante el testing de esa extensión** (no relacionado al frontend en sí): la rama "administrar" ya tenía `resource.data.coOrganizersMap.get(request.auth.uid, null)` — acceso directo sin default, seguro **antes** de la Fase 3 porque esa rama solo era alcanzable cuando `coOrganizersMap` ya existía (así lo garantizaba el `isCoOrganizerData` de esa época). Al generalizar `isCoOrganizerData` para también aceptar colaboradores nuevo-estilo (Fase 3), un evento con `collaborators` pero SIN `coOrganizersMap` en absoluto ahora podía alcanzar esa rama y `.get()` sobre un campo inexistente tira `PERMISSION_DENIED: Unable to evaluate... Property coOrganizersMap is undefined on object` — lo detectó un test nuevo, no inspección manual. Se corrigió ese acceso y uno idéntico en la rama de "salir del evento" (mismo patrón, mismo riesgo aunque no se había disparado todavía) a `resource.data.get('coOrganizersMap', {})`.

**Tests**: 3 nuevos en `collaboratorPermissions.rules.test.ts` (dueño administra `collaborators` directo, administrador-colaborador administra a otros sin autoescalarse, colaborador de rol angosto se quita a sí mismo pero no a otros) — total 307/307 en `test:firebase` (304 previos + 3). Sin tests de componente para `CollaboratorPanel`/`AcceptCollaboratorInvite`/el redirect de `EventDetail` — mismo criterio ya establecido en el proyecto (`EventDetail.tsx` nunca tuvo cobertura de este tipo, ver memoria de sesiones previas); se verificó con `tsc -b`, `eslint`, `npm run test` (182/182), `npm run build` y `knip` (detectó y permitió limpiar 2 exports muertos reales).

**Deliberadamente NO implementado en esta fase**: cambiar el rol de un colaborador ya aceptado (hay que revocar y re-invitar); badge de rol en `EventTicketCard`/`Dashboard`; consolidación de `CoOrganizerPanel`/`ConcessionStaffPanel`/`CollaboratorPanel` en una sola UI (los tres siguen coexistiendo intencionalmente mientras dure la migración, ver Fase 6).

**Fase 5 — Rol Comunidad. ✅ Implementado (2026-08-13), pendiente commitear/deployar.** Sexto rol (`comunidad`) agregado en los 3 lugares donde vive el catálogo de roles (`src/types/collaboratorPermissions.ts`, `functions/src/lib/permissions.ts`, `firestore.rules` — mismo patrón de cuádruple duplicación manual ya documentado y aceptado para los otros 5). Preset mínimo: únicamente `moderateWall`+`postWall`, sin ningún otro acceso (invitados, pagos, catálogo, reportes, colaboradores todos en `false`) — aislado de `manageCoOrganizers`/`editEvent` que sí tiene Administrador. Agregado al selector de `CollaboratorPanel.tsx` y a `COLLABORATOR_ROLE_LABELS`/`COLLABORATOR_ROLE_DESCRIPTIONS`. 3 tests nuevos (cliente, `functions/`, rules) confirmando que modera el muro pero no puede tocar nada más — `test:firebase` 308/308 (307+1), `test:functions` 444/444 (443+1), `tsc`/`eslint`/`npm run test` (183/183)/`build`/`knip` en ambos runtimes — todo verde.

**Fase 6 — Limpieza. ⏳ Backfill preparado (2026-08-13), retiro de mapas legacy NO ejecutado — bloqueado por diseño.** Retirar `coOrganizersMap`/`coOrganizerPermissions`/`concessionsStaffMap` como campos de escritura requiere primero confirmar en producción que todo colaborador activo tiene entrada equivalente en `collaborators` — precondición que hoy no se cumple (nada de las Fases 1-5 está deployado todavía, y sin backfill ningún coorganizador/encargado de ventas legacy real tendría esa entrada). Se preguntó explícitamente al usuario cómo proceder dado ese hueco; eligió preparar el backfill ahora sin tocar todavía el código que retira los mapas legacy.

Nuevo `scripts/backfill-collaborators-from-legacy.mjs` (mismo patrón que `backfill-admin-claims.mjs`/`backfill-concessions-staff-roles.mjs`: Admin SDK, `FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7` o `FIRESTORE_EMULATOR_HOST`, one-off manual, sin GitHub Actions). Migra cada `coOrganizersMap[uid]` → `collaborators[uid] = { role: 'administrador' }` (mismo criterio ya documentado en §3: no hay señal para inferir un rol más angosto) y cada `concessionsStaffMap[uid]` → `role: 'caja'` (si `roles.cashier`, con `permissionOverrides.prepareOrders: true` si además `roles.prep`) o `role: 'preparacion'` (solo prep, o shape legado string) — resuelve la ambigüedad que §3 había dejado abierta ("decisión de implementación a definir en la fase correspondiente"). Nunca pisa una entrada ya existente en `collaborators` (ni de una corrida anterior del propio script, ni de una invitación real ya aceptada por el sistema nuevo) ni toca los mapas legacy — solo agrega.

**Verificado manualmente contra el emulador** (sin precedente de test automatizado para ningún script de `scripts/*.mjs` en el proyecto, mismo criterio ya establecido): sembrados 2 eventos con casos borde (coorganizador simple, coorganizador que además está en `concessionsStaffMap` con distinto rol — gana `coOrganizersMap`, cajero solo, cajero+prep, prep solo, shape legado string, un colaborador ya migrado por el sistema nuevo, el propio `ownerId` colado por error en `coOrganizersMap`, un evento sin nada que migrar). 10/10 verificaciones correctas en la primera corrida; segunda corrida confirmó idempotencia total (0 eventos tocados, 0 colaboradores creados).

**Deliberadamente NO hecho en esta fase**: correr el script contra producción, y retirar cualquier lectura/escritura de los 3 mapas legacy en rules/`functions/`/frontend — ambos pasos quedan bloqueados hasta que el usuario deploye las Fases 1-5, corra este backfill en producción, y confirme (manualmente, mismo criterio que el período de espera ya usado para retirar el fallback `exists()` de `isAdmin()`) que todo colaborador activo real quedó con su entrada equivalente en `collaborators`.

## 5. Decisiones explícitas (no asumidas)

- **Rol Comunidad**: se deja fuera de la v1, como permiso dentro de Administrador — decisión confirmada con el usuario. Documentado en §2.3/§4 como extensión trivial a futuro.
- **Fotógrafo, Moderador, Analista, Staff general**: no se implementan — no hay superficie de producto o urgencia que lo justifique hoy; se resuelven con `permissionOverrides` puntuales si surge un caso real.
- **Confirmación de pago en Recepción**: modelada como override opcional, no como permiso base del rol, para no forzar ese acceso en eventos donde el anfitrión prefiere que solo Caja confirme pagos.

## 6. Riesgos y puntos pendientes

- El límite de 1000 expresiones de Firestore ya se golpeó dos veces en producción con el sistema actual (más simple que el propuesto en superficie, aunque el nuevo modelo consolida en vez de sumar ramas) — cualquier implementación de Fase 3 debe medir el costo de expresiones de la nueva regla unificada antes de deployar, no asumir que consolidar mapas automáticamente reduce el costo.
- La migración de `coOrganizersMap` a `role: 'administrador'` para todos los coorganizadores existentes es deliberadamente conservadora (no downgradea a nadie) — el dueño deberá revisar y ajustar roles manualmente después de la migración si quiere aplicar principio de mínimo privilegio a colaboradores ya existentes.
- No se ha decidido el modelo de datos exacto para un colaborador con múltiples roles simultáneos (ej. Caja + Preparación) — queda para la Fase 1 de implementación, no bloquea el diseño de arquitectura.
- Este documento no cubre auditoría de acciones sensibles (sección 21 del ticket original: quién confirmó qué pago, quién cambió qué rol) — es una extensión razonable de `adminAuditLog` (ya existe para acciones de plataforma) a nivel de evento, pero se deja fuera de alcance de esta primera propuesta para no inflar el tamaño del cambio.

## 7. Próximos pasos

Este documento queda como referencia viva (actualizar al cerrar cada fase, mismo criterio que `FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md`). Pendiente de decisión del usuario: con cuál fase arrancar la implementación.
