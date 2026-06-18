# PaseLink

Aplicación web para gestionar invitaciones, listas de invitados y control de acceso a eventos mediante códigos QR.

## Índice

- [Descripción del producto](#descripción-del-producto)
- [Stack tecnológico](#stack-tecnológico)
- [Instalación local](#instalación-local)
- [Configuración Firebase](#configuración-firebase)
- [Flujo de desarrollo](#flujo-de-desarrollo)
- [Testing](#testing)
- [Despliegue](#despliegue)
- [Checklist de lanzamiento](#checklist-de-lanzamiento)
- [Problemas conocidos](#problemas-conocidos)

---

## Descripción del producto

**PaseLink** resuelve el problema de organizar el ingreso a un evento (fiesta, conferencia, evento privado) sin depender de listas en papel o planillas sueltas: el organizador crea el evento, carga o deja que los propios invitados se autorregistren, y cada invitado recibe un pase con código QR único. En la puerta, el organizador escanea ese QR desde el celular y la app confirma el ingreso en tiempo real, evitando duplicados y respetando el cupo del evento.

**Funcionalidades principales:**

- Creación de eventos con portada, color de marca, mensaje de bienvenida y campos personalizados.
- Tres modos de ingreso: lista cerrada (el organizador carga invitados), ingreso libre (los invitados se autorregistran) e híbrido (ambos).
- Generación de pases con QR único por invitado, exportables en PDF o por CSV.
- Escaneo de QR desde cámara para check-in/check-out en tiempo real, con control de cupo.
- Lista de espera automática cuando el evento se llena, con promoción manual por el organizador.
- Muro del evento en tiempo real (comentarios, preguntas, reacciones) con moderación del organizador.
- Recordatorios por email a invitados sin confirmar.
- Reportes y analíticas básicas por evento (asistencia, horarios pico, recaudación si el evento cobra entrada).
- Co-organizadores: el dueño del evento puede dar acceso de escaneo a otras personas.
- Panel de administración global (solo para el email configurado como admin).

---

## Stack tecnológico

**Frontend**
- React 19 + TypeScript, compilado con Vite.
- React Router 7 (rutas con `lazy()` + `Suspense` por página).
- Tailwind CSS 4.
- `html5-qrcode` (escaneo de cámara), `qrcode`/`qrcode.react` (generación de QR), `jspdf` (exportación de pases en PDF), `react-easy-crop` (recorte de fotos), `canvas-confetti` (feedback visual de check-in).

**Firebase**
- **Authentication** — email/password, Google y Facebook.
- **Firestore** — única base de datos de la app; también actúa como "backend": no hay Cloud Functions, toda la autorización vive en `firestore.rules`.
- **Hosting** — sirve el build estático de Vite.
- **App Check** (opcional) — anti-bot con reCAPTCHA v3 para formularios públicos.

**Servicios externos**
- **EmailJS** — correo de bienvenida y recordatorios, 100% desde el cliente (sin backend propio).
- **Cloudinary** — almacenamiento y optimización de fotos de portada/perfil.

**Testing y calidad**
- Vitest + jsdom para tests unitarios.
- ESLint (`typescript-eslint`) + `tsc --noEmit` como gates de CI.

---

## Instalación local

### Requisitos

- Node.js 20.x (la misma versión que usa CI — ver `.github/workflows/`).
- Una cuenta de Firebase con un proyecto creado (o acceso al proyecto existente `app-pases-9e6e7`).
- Opcional para correr todas las funcionalidades en local: cuentas de EmailJS y Cloudinary (la app funciona sin ellas, simplemente esas dos integraciones quedan inactivas).

### Comandos

```bash
npm install        # instalar dependencias
npm run dev         # levantar servidor de desarrollo (Vite)
npm run build        # type-check + build de producción a dist/
npm run preview       # servir el build de dist/ localmente
npm run lint         # ESLint
npm run test         # Vitest (modo run, no watch)
```

### Variables de entorno

Copiar `.env.example` a `.env` y completar:

| Variable | Obligatoria | Descripción |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Sí | Config del proyecto Firebase (Project Settings → General → Tus apps). |
| `VITE_FIREBASE_AUTH_DOMAIN` | Sí | Idem. |
| `VITE_FIREBASE_PROJECT_ID` | Sí | Idem. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Sí | Idem. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sí | Idem. |
| `VITE_FIREBASE_APP_ID` | Sí | Idem. |
| `VITE_EMAILJS_SERVICE_ID` | No | [emailjs.com](https://www.emailjs.com/) — sin esto, no se envían correos de bienvenida/recordatorio (falla en silencio, no rompe el resto de la app). |
| `VITE_EMAILJS_TEMPLATE_ID_WELCOME` | No | Idem. |
| `VITE_EMAILJS_TEMPLATE_ID_REMINDER` | No | Idem. |
| `VITE_EMAILJS_PUBLIC_KEY` | No | Idem. |
| `VITE_CLOUDINARY_CLOUD_NAME` | No | [cloudinary.com](https://cloudinary.com/) — sin esto, no se pueden subir fotos de portada/perfil. |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | No | Debe ser un *upload preset* sin firmar (unsigned), restringido a imágenes en la configuración de Cloudinary. |
| `VITE_RECAPTCHA_SITE_KEY` | No | reCAPTCHA v3 desde [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin). Sin esto, los formularios públicos (muro, lista de espera, auto-registro) quedan sin protección anti-bot. Ver checklist de lanzamiento. |

**Importante:** estas variables se inyectan en el bundle de Vite en tiempo de build (`import.meta.env.VITE_*`). No son secretas en el sentido de "ocultas del cliente" — quedan visibles en el JS servido al navegador. La seguridad real de Firestore depende de `firestore.rules`, no de ocultar estas variables.

---

## Configuración Firebase

Proyecto actual: `app-pases-9e6e7` (ver `.firebaserc`).

### Authentication
Providers habilitados en el código: **Email/Password**, **Google**, **Facebook**. Deben estar activados en Firebase Console → Authentication → Sign-in method para que el login/registro funcione.

### Firestore
- Base de datos en modo nativo (no Datastore).
- Reglas de seguridad en `firestore.rules` — son la única capa de autorización del proyecto (no hay backend propio ni Cloud Functions).
- Índices compuestos en `firestore.indexes.json` (hoy solo uno: `events` por `ownerId` + `createdAt`, usado por "Mis eventos"). Si se agrega una query nueva con `where` + `orderBy` en campos distintos, Firestore va a pedir un índice nuevo — agregarlo aquí, no solo aceptarlo desde la consola, para que quede versionado.

### Hosting
Configurado en `firebase.json`: sirve `dist/` con *rewrite* de SPA (todas las rutas devuelven `index.html`, el ruteo lo resuelve React Router en el cliente).

### App Check
Opcional pero recomendado antes de tener usuarios reales. Protege contra scripts automatizados en los formularios públicos (auto-registro, lista de espera, muro). Pasos:
1. Crear una clave reCAPTCHA v3 en [google.com/recaptcha/admin](https://www.google.com/recaptcha/admin) para el dominio de producción.
2. Completar `VITE_RECAPTCHA_SITE_KEY` (local y como secret de GitHub Actions).
3. Registrar la app web en Firebase Console → App Check, y activar el proveedor reCAPTCHA v3.
4. Activar **"Enforce"** en App Check → Firestore. Sin este paso, App Check está configurado pero no bloquea nada — es el paso que realmente activa la protección.

### Reglas (`firestore.rules`)
Resumen de lo que protegen hoy:
- `events`, `wall` (lectura) — públicos por diseño (el evento y su muro son compartibles sin login).
- `guests` — documento legible públicamente solo para que el pase compartible (`/pass/:eventId/:qrToken`) funcione sin login; **`email`/`phone` viven aparte en `guestContacts`**, que nunca es público.
- `wall`, `waitlist`, auto-registro de invitados — `create` público pero con validación de tamaño/tipo de campos (ver `isValidWallMessage`, `isValidWaitlistEntry`, `isValidPublicGuestRegistration` en el propio archivo).
- El email de administrador está hardcodeado en `isAdmin()` (`firestore.rules`) **y** en `src/config/admin.ts` — si se cambia, hay que actualizar ambos lugares manualmente (no hay una sola fuente de verdad todavía).

---

## Flujo de desarrollo

### Branches
No hay un modelo de branching formal todavía (proyecto de un solo desarrollador). Recomendado al crecer el equipo:
- `main` — siempre desployable; cada push acá dispara el deploy de producción.
- Rama por feature/fix, mergeada a `main` vía Pull Request.

### CI/CD
- **Cualquier PR** dispara `firebase-hosting-pull-request.yml`: corre lint + `tsc --noEmit` + tests (job `validate`); si pasa y la PR es del mismo repo (no de un fork), además publica un *preview channel* de Firebase Hosting.
- **Push a `main`** dispara `firebase-hosting-merge.yml`: mismo gate `validate` y, solo si pasa, `build_and_deploy` construye y despliega a producción (`channelId: live`).
- Si `validate` falla (lint, tipos o tests rotos), el deploy **no se ejecuta** — ver Tarea 1 de la preparación para producción.
- El gate de CI no corre `firebase deploy --only firestore:rules` ni tests de reglas — los cambios a `firestore.rules` se despliegan manualmente (ver [Despliegue](#despliegue)).

### Comandos útiles
```bash
npm run lint            # antes de cualquier commit
npx tsc --noEmit          # chequeo de tipos sin generar archivos
npm run test            # tests unitarios
npm audit              # estado de vulnerabilidades de dependencias
firebase deploy --only firestore:rules   # desplegar SOLO las reglas (ver más abajo)
```

---

## Testing

```bash
npm run test     # corre toda la suite de Vitest una vez (no watch)
npm run lint     # ESLint sobre todo el proyecto
npx tsc --noEmit   # type-check sin emitir archivos
```

**Cobertura actual:** tests unitarios sobre funciones puras de `src/utils/` (formato de URLs de Cloudinary, extracción de coordenadas de Google Maps, parseo de QR, validaciones de longitud/contenido, y la lógica de progreso/cancelación de la exportación de PDF con `jspdf`/`qrcode` mockeados). **No hay tests** sobre la capa `src/firebase/*` (la lógica de negocio real: check-in, control de cupo, autenticación) ni sobre `firestore.rules` — ver [Problemas conocidos](#problemas-conocidos).

**Antes de cualquier deploy manual** (no solo el automático de CI), correr en este orden:
```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
```
Si los cuatro pasan, es seguro continuar con el deploy.

---

## Despliegue

Requiere [Firebase CLI](https://firebase.google.com/docs/cli) instalado (`npm install -g firebase-tools`) y sesión iniciada (`firebase login`) con acceso al proyecto `app-pases-9e6e7`.

### Producción (automático, recomendado)
Simplemente mergear/pushear a `main`. El workflow `firebase-hosting-merge.yml` valida y despliega el hosting solo. **Esto NO despliega `firestore.rules`** — son pasos independientes a propósito, porque un cambio de reglas mal hecho puede bloquear escrituras legítimas en producción sin previo aviso, y conviene desplegarlo de forma consciente, no como efecto secundario de cualquier push.

### Desplegar `firestore.rules` (manual, paso a paso)
```bash
firebase login                          # si no hay sesión activa
firebase use app-pases-9e6e7              # confirmar proyecto correcto
firebase deploy --only firestore:rules       # despliega SOLO las reglas
```
Hacerlo después de validar localmente (`npm run build` exitoso, reglas revisadas) y, si es posible, probar primero contra el emulador de Firestore (`firebase emulators:start`) antes de aplicar a producción — hoy no hay tests automatizados de reglas, así que la revisión manual es la única red de seguridad.

### Desplegar Hosting manualmente (sin pasar por CI)
```bash
npm run build
firebase deploy --only hosting
```
Usar solo si se necesita un deploy de emergencia fuera del flujo de CI — el camino normal es pushear a `main`.

### Desplegar todo de una vez
```bash
firebase deploy
```
Despliega hosting + reglas + índices juntos. Usar con cuidado: junta dos cosas (código y reglas de seguridad) que normalmente conviene desplegar y revisar por separado.

---

## Checklist de lanzamiento

Antes de poner la aplicación en manos de usuarios reales:

- [ ] **Desplegar `firestore.rules`** (`firebase deploy --only firestore:rules`) — el archivo en el repo puede estar adelantado a lo que realmente está protegiendo producción. Confirmar con `firebase deploy --only firestore:rules --dry-run` si la versión de Firebase CLI lo soporta, o revisar el historial de reglas en Firebase Console → Firestore → Reglas.
- [ ] **Activar "Enforce" de App Check** en Firebase Console → App Check → Firestore (con `VITE_RECAPTCHA_SITE_KEY` ya configurada y desplegada).
- [ ] **Verificar GitHub Actions**: confirmar que los secrets necesarios existen en Settings → Secrets and variables → Actions (ver lista completa en [Variables de entorno](#variables-de-entorno) + `FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7`), y que el último run de `firebase-hosting-merge.yml` terminó en verde.
- [ ] **Ejecutar tests** (`npm run test`) y confirmar 0 fallos.
- [ ] **Ejecutar build** (`npm run build`) y confirmar que termina sin errores de tipos.
- [ ] **Verificar variables de entorno** tanto en `.env` local como en los secrets de GitHub — en particular, que EmailJS/Cloudinary/reCAPTCHA estén completos si se quiere lanzar con esas funcionalidades activas (antes de esta tarea, los workflows de deploy no las pasaban al build; ya está corregido, pero los *secrets* deben existir en GitHub para que tomen efecto).
- [ ] Confirmar que el email configurado en `src/config/admin.ts` y en `isAdmin()` de `firestore.rules` siguen siendo el mismo (no hay validación automática de esto).
- [ ] Probar el flujo completo end-to-end al menos una vez en producción real (no solo en local): crear evento → registrar invitado → escanear QR → ver reflejado el check-in.

---

## Problemas conocidos

### Limitación de `customData` en Firestore Rules
Las reglas de Firestore no pueden iterar un mapa para validar la longitud de cada valor individual dentro de `customData` (los campos personalizados que el organizador define para su evento). Por eso, en el auto-registro público de invitados, la regla `isValidPublicGuestRegistration()` solo limita la **cantidad** de campos (≤30), no el largo de cada valor — ese límite (300 caracteres) solo lo garantizan la UI y `src/firebase/capacity.ts`. Si alguien evita por completo la app y escribe directo a Firestore, podría meter un valor de texto muy largo en un campo personalizado. Cerrarlo del todo requeriría rediseñar `customData` como una lista de pares validables individualmente — no se hizo porque el riesgo real es bajo y el cambio no es trivial.

### Riesgos aceptados para la primera versión
- **Datos de invitados de eventos creados antes de la separación de `guestContacts`** (si llegaran a existir) conservarían `email`/`phone` en el documento público de `guests` hasta editarse manualmente — no aplica hoy porque los datos actuales son de prueba, pero quedará pendiente si se promueven datos reales de antes de ese cambio.
- El email del administrador vive en dos archivos sin sincronía automática (`firestore.rules` y `src/config/admin.ts`) — bajo riesgo mientras el proyecto tenga un solo admin, pero es un punto de error humano si se rota.
- `wall`/`waitlist`/auto-registro tienen límites de tamaño, pero no rate-limiting real más allá de lo que aporte App Check (que es opcional hasta que se active "Enforce").
- El alta de invitados hecha por el **organizador** (`addGuest`/`addGuestsBulk`/`GuestAddForm`) no tiene los mismos límites de longitud que se aplicaron al auto-registro público — es una superficie autenticada, de menor urgencia, pero el mismo patrón de validación debería extenderse ahí.

### Deuda técnica pendiente
- Sin tests automatizados sobre `src/firebase/capacity.ts` ni `src/firebase/guests.ts` (check-in/check-out, control de cupo) — es la lógica más crítica de la app y hoy depende solo de revisión manual.
- Sin tests de `firestore.rules` (requeriría `@firebase/rules-unit-testing` + emulador).
- Duplicación de código entre `EventCreate.tsx`/`EditEventForm.tsx`, `Dashboard.tsx`/`MyEvents.tsx`, y `EventWall.tsx`/`WallSection.tsx`.
- `GuestList`/`EventAnalytics` sin memoización — solo importa con eventos de varios miles de invitados.
- Listeners sin `limit()` en `subscribeToAllEvents`/`subscribeToAllUsers`/`subscribeToUserEvents`/`subscribeToWaitlist` — bajo riesgo mientras el volumen de eventos/usuarios sea moderado.
- Sin Context API para `useAuth`/`useUserProfile` (cada componente que los usa abre su propia suscripción a Firestore).
