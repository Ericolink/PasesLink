# Features de innovación v1: Recordatorio de salida + Plantillas comunitarias

Documento de arquitectura para las 2 features "de innovación" (prioridad baja, explícitamente no-MVP) pedidas para diferenciar PaseLink de Partiful/Luma/Apple Invites/Paperless Post/Canva/Figma/Notion. Complementa `PLATFORM_EXPANSION_ARCHITECTURE.md` (mismo criterio: reutilizar infraestructura existente, documentar decisiones, no romper nada) y `INVITATION_COMPETITIVE_ANALYSIS.md` (que ya identificaba ambas como gaps frente a la competencia).

## 0. Resumen ejecutivo

| Módulo | Estado | Cabe en Spark (sin Cloud Functions) |
|---|---|---|
| Recordatorio inteligente de salida | ✅ Implementado (cálculo on-demand, sin envío proactivo) | Sí — 100% cliente |
| Plantillas comunitarias | ✅ Implementado (envío → revisión → aprobación → uso) | Sí — sin colección/regla nueva que requiera backend propio |

Ambas features corren enteras dentro del plan Spark actual (sin Cloud Functions), a diferencia de "pago real" (que sí lo necesita, ver `PLATFORM_EXPANSION_ARCHITECTURE.md` §4). Dos decisiones de producto se tomaron explícitamente con el usuario antes de implementar (documentadas en la sección de cada feature) porque cambiaban el modelo de datos o el alcance de forma material.

## 1. Recordatorio inteligente de salida

### Decisión de producto (tomada con el usuario)

El pedido original describía un recordatorio **proactivo** (push/email antes del evento). Eso requiere saber desde dónde sale cada invitado — un dato que PaseLink no tiene. Guardarlo habría significado pedir una dirección nueva y sensible a cada invitado, más un cron adicional. Se optó por **cálculo on-demand**: el invitado abre su pase, otorga permiso de geolocalización del navegador, y ve la recomendación en pantalla al instante. Cero datos nuevos guardados, cero costo recurrente de proveedor.

### Arquitectura

```
src/services/travel/
  types.ts                    → Coordinates, RouteEstimate, RouteProvider, WeatherProvider
  providers/openRouteService.ts → RouteProvider real (api.openrouteservice.org)
  providers/openMeteo.ts        → WeatherProvider = wrapper sobre fetchWeatherForecast YA existente
  departureCalculator.ts       → computeDepartureRecommendation() — función pura, testeable sin red
```

`RouteProvider`/`WeatherProvider` son interfaces mínimas (mismo idioma que ya usa el proyecto — funciones documentadas, no clases ni DI). Un proveedor nuevo (ej. Google Routes si algún día se evalúa Blaze) es un archivo más en `providers/`, sin tocar `departureCalculator.ts` ni el resto del sistema — así se cumple "no acoplar a un proveedor específico" del pedido original.

**Proveedores de referencia elegidos con el usuario**: Open-Meteo (clima, sin API key, **ya usado por el clima del pase** — se reutilizó tal cual, cero duplicación) y OpenRouteService (ruta/tiempo estimado, key gratuita, sin tráfico en vivo). Ambos gratis sin tarjeta, mismo criterio que EmailJS/Cloudinary/Brevo en el resto del stack.

### Degradación elegante

- Sin `mapsUrl` parseable o sin `startTime` válido → la tarjeta entera no aparece (mismo criterio que `EventMap`/`EventWeather`).
- Proveedor de ruta falla/sin key/cuota agotada → `null`, nunca un tiempo de viaje inventado.
- Proveedor de clima falla → se omite solo el clima, el resto de la recomendación se muestra igual.
- OpenRouteService free tier no da tráfico en vivo → se etiqueta explícitamente "estimado sin tráfico en vivo" en vez de fingir precisión.

### UI

`useDepartureReminder` (hook) + `DepartureReminder` (componente), insertados en `GuestPass.tsx` junto a `EventMap`/`EventWeather`. Botón explícito "Calcular mi hora de salida" (la geolocalización requiere un gesto del usuario, no puede pedirse en un `useEffect` silencioso). Cache en `localStorage` (60 min, mismo TTL que el clima) para no repetir llamadas si el invitado vuelve a abrir el pase. Margen configurable: `EventData.departureReminderBufferMinutes` (default 15, ajustable por el organizador) + un stepper +/- en el propio widget para que el invitado lo ajuste sin recalcular contra el proveedor.

## 2. Plantillas comunitarias

### Por qué es un problema de datos, no de código

`InvitationTemplate['vars']` (`src/templates/registry.ts`) ya era un objeto de tokens de diseño puros (colores hex, tipografía de una lista curada, radios, sombras, animación de un enum fijo) — nada de JS ejecutable. Esto hizo que "abrir el catálogo a diseñadores externos" fuera, en los hechos, un flujo de **contenido moderado** (como el buzón de feedback), no un problema de sandboxing de código.

### Decisión de diseño clave: no tocar el registro de plantillas

`TemplateId` es una unión cerrada a propósito (fuerza un error de tipos si se referencia una plantilla sin definición visual) y se usa como `Record<TemplateId, X>` en 5 mapas (ornamentos, sellos, íconos del picker, contenido de preview, recetas de compartir). Ensancharla habría propagado el problema a todos esos mapas.

En cambio, se reutilizó un mecanismo que **ya existía**: `EventData.themeOverrides` fluye a `buildInviteThemeStyle(templateId, overrides: Partial<TemplateVars>)`, que ya acepta un set completo de tokens por tipado estructural. Se agregó un campo **nuevo y separado**, `EventData.communityTemplateSnapshot?: { id, name, vars }` — una **copia congelada** de los tokens de la plantilla comunitaria al momento en que el organizador la elige (no una referencia viva). `templateId` queda en `'default'` cuando hay snapshot.

Resultado: `getTemplate()`, los 5 `Record<TemplateId,X>` y el enum de Zod de `templateId` **no se tocaron**. Agregar una plantilla comunitaria nueva es un documento de Firestore más, aprobado por un admin — nunca un cambio de código, cumpliendo literalmente el requisito "la incorporación de nuevas plantillas no debe requerir modificar el código principal".

Congelar en vez de referenciar en vivo también resuelve, gratis, el caso "el admin archiva la plantilla después": los eventos que ya la eligieron siguen renderizando exactamente igual — mismo criterio que `amountDueMinorUnits` en la arquitectura de pagos (`PLATFORM_EXPANSION_ARCHITECTURE.md` §4.3).

### Modelo de datos

`communityTemplates/{id}` (colección top-level nueva):

```ts
interface CommunityTemplate {
  id, name, authorUid, authorDisplayName, description, category,
  previewImageUrl?, vars: CommunityTemplateVars, license, version,
  compatibility: string[],   // informativo, sin validación automática todavía
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'archived',
  reviewerUid?, reviewNotes?, createdAt, submittedAt?, publishedAt?, updatedAt,
}
```

Flujo: `draft → in_review → approved | rejected → (reenvío → in_review) ; approved → archived`. Reglas en `firestore.rules` (mismo patrón que `reports`): el autor solo puede tocar su propio doc mientras está en `draft`/`rejected`, y solo puede transicionarlo a `in_review` — nunca a `approved`/`archived` ni tocar `reviewerUid`/`reviewNotes`/`publishedAt`. El admin puede todo. Lectura de plantillas `approved` disponible para cualquier usuario autenticado (así el picker puede ofrecerlas); el autor puede leer sus propios envíos en cualquier estado.

**Validación real, no solo diagnóstica**: a diferencia del resto de `schemas.ts` (que valida la salida de mappers propios, solo para loguear), `CommunityTemplateVarsSchema` valida contenido generado por un tercero: colores restringidos a hex estricto, tipografías a la misma lista curada de 3 opciones que ya usa `themeOverrides.secondaryFontFamily`, `shadow`/`borderRadius` restringidos a un alfabeto seguro (sin `;`, `{`, `url(`). El formulario de envío usa el mismo schema para bloquear, no solo para loguear.

### Flujo completo

1. **Envío** (`src/pages/SubmitCommunityTemplate.tsx`): formulario con selects curados (nunca texto libre para tokens de diseño) + color pickers nativos (`<input type="color">`, siempre hex válido) + preview en vivo compartido (`CommunityTemplatePreviewCard`) + subida de portada reusando `useCoverPhoto`/`uploadImage` (mismo Cloudinary que las portadas de evento). "Guardar borrador" / "Enviar a revisión". Reutilizable también para editar y reenviar tras un rechazo (`/my-templates/:id/edit`).
2. **Mis envíos** (`src/pages/MyCommunityTemplates.tsx`): estado + notas de revisión del admin si fue rechazada.
3. **Moderación admin** (`AdminCommunityTemplatesTable`/`AdminCommunityTemplateDetail`, nuevo tab "Plantillas" en `/admin`): aprobar/rechazar (con nota)/archivar. Mismo patrón que el tab "Buzón" ya existente — el listener solo se suscribe mientras el tab está activo.
4. **Selección** (`TemplatePicker.tsx` extendido, sección "Comunidad"): fila de swatches además de los íconos curados existentes. Elegir una plantilla comunitaria copia su `vars` a `communityTemplateSnapshot` y deja `templateId` en `'default'`.
5. **Render**: `InvitationThemeRoot` (y sus 7 puntos de uso: `GuestPass`, `EventJoin`, `EventArrive`, `EventWall` ×2, `OrganizerPassView`, `InvitationPreview`) mezcla `communityTemplateVars` por debajo de `themeOverrides` — los ajustes manuales del organizador siguen ganando.

### Alcance v1 explícito (y cómo evoluciona sin refactor mayor)

- **No implementado todavía, documentado como extensión aditiva futura**: perfiles de diseñador, valoración/descargas/métricas de uso, colecciones curadas, plantillas premium/monetización, revisión automática de calidad más allá de la validación estructural de Zod. Todos encajarían como campos nuevos opcionales sobre el mismo doc (ej. `rating`, `downloadCount`), sin migración — mismo criterio que "pago real"/"CRM" en `PLATFORM_EXPANSION_ARCHITECTURE.md`.
- **Selección de plantilla comunitaria solo en edición de evento** (`EditEventForm.tsx`), no todavía en el wizard de creación (`StepReviewTemplate.tsx`) — decisión de alcance para esta sesión, no una limitación de arquitectura: `TemplatePicker` ya expone los props (`communityTemplates`, `selectedCommunityTemplate`, `onSelectCommunity`) necesarios; conectarlo en el wizard es pasar los mismos 3 props ahí.
- **Theming de plantilla comunitaria alcanza el pase, RSVP, muro y vista de organizador** (los 7 puntos de `InvitationThemeRoot`), pero **no** todavía el boleto exportable (`ticketTheme.ts`/`EventTicketCard`), las tarjetas de estadísticas del dashboard (`dashboardTheme.ts`) ni la imagen para compartir (`buildEventShareCard.ts`) — esas 3 superficies siguen mostrando el look neutro de `'default'` para un evento con plantilla comunitaria. Es una degradación elegante (nunca rota), documentada acá como el primer follow-up natural si se prioriza.

## 3. Impacto en Firestore / Cloud Functions / costos

| Módulo | Colecciones nuevas | Índices nuevos | Cloud Functions | Costo incremental |
|---|---|---|---|---|
| Recordatorio de salida | Ninguna | Ninguno | Ninguna | 1 llamada a OpenRouteService + 1 a Open-Meteo por invitado que pulsa el botón (cacheadas 60 min) — cero Firestore |
| Plantillas comunitarias | `communityTemplates` | Ninguno (queries de un solo campo: `status==`, `authorUid==`) | Ninguna | Escrituras: 1 por envío/edición/revisión (bajo volumen, catálogo curado). Lecturas: solo mientras el picker/panel admin/mis-envíos están abiertos — **nunca** en el camino de renderizado del invitado (la vista congelada evita re-leer la plantilla en cada pase) |

**Riesgo real a vigilar**: la API key de OpenRouteService es client-side y compartida por todos los usuarios de la PWA (Spark, sin backend para ocultarla). Mitigado con restricción por dominio en el dashboard del proveedor + cache local, pero si el volumen de PaseLink crece lo suficiente para agotar la cuota gratis (2000 req/día) consistentemente, hace falta evaluar un proxy serverless o cambiar de proveedor — misma clase de decisión pospuesta que ya documenta `PLATFORM_EXPANSION_ARCHITECTURE.md` para pago real, no resuelta preventivamente acá.

**Bug preexistente corregido de paso**: `firebase.json` (`connect-src`) no incluía `api.open-meteo.com`, así que el widget de clima del pase probablemente estaba bloqueado por CSP en producción desde que se agregó (fallaba en silencio, por diseño). Se corrigió en el mismo cambio que agregó `api.openrouteservice.org`.

## 4. Por qué cada feature aporta valor diferencial

- **Recordatorio de salida**: ninguna plataforma de invitaciones (Partiful, Luma, Apple Invites, Paperless Post) calcula esto hoy — Google/Apple Maps sí, pero desconectado del contexto del evento (hora exacta, margen deseado). Convierte a PaseLink de "quién viene" a "ayudo a que lleguen a tiempo", con degradación honesta (nunca inventa un dato que no tiene) en vez de una promesa vacía.
- **Plantillas comunitarias**: el catálogo de plantillas hoy depende 100% del equipo de PaseLink — mismo cuello de botella que Canva/Figma ya resolvieron con comunidades de creadores. La arquitectura elegida (datos puros + moderación) es lo que permite escalar el catálogo sin escalar el equipo de diseño, y sin abrir una superficie de riesgo (no hay código de terceros ejecutándose, todo es un set validado de tokens CSS).

## 5. Archivos

**Nuevos** — Recordatorio de salida: `src/services/travel/{types.ts,departureCalculator.ts,providers/openRouteService.ts,providers/openMeteo.ts,__tests__/departureCalculator.test.ts}`, `src/hooks/useDepartureReminder.ts`, `src/components/DepartureReminder.tsx`.

**Nuevos** — Plantillas comunitarias: `src/firebase/{communityTemplates.ts,__tests__/communityTemplates.test.ts}`, `src/hooks/useApprovedCommunityTemplates.ts`, `src/pages/{SubmitCommunityTemplate.tsx,MyCommunityTemplates.tsx}`, `src/components/{CommunityTemplatePreviewCard.tsx,CommunityTemplateSwatchRow.tsx}`, `src/components/Admin/{AdminCommunityTemplatesTable.tsx,AdminCommunityTemplateDetail.tsx}`.

**Modificados** (ambas features): `src/types/index.ts`, `src/types/schemas.ts`, `src/templates/registry.ts` (nuevos exports curados, `INVITATION_TEMPLATES` sin cambios), `firestore.rules`, `firebase.json`, `.env.example`, `src/firebase/events.ts`, `src/pages/{GuestPass.tsx,EventJoin.tsx,EventArrive.tsx,EventWall.tsx,AdminDashboard.tsx}`, `src/components/{EditEventForm.tsx,SectionsEditor.tsx,TemplatePicker.tsx,InvitationThemeRoot.tsx,OrganizerPassView.tsx}`, `src/utils/time.ts`, `src/App.tsx`.

## 6. Verificación

- `npx tsc -b && vite build`: sin errores.
- `npm run lint`: sin errores (warnings preexistentes sin relación, no introducidos por este trabajo).
- `npm run test`: 107/107 (incluye 4 tests nuevos de `departureCalculator`, sin red).
- `npm run test:firebase`: 178/178 (incluye 6 tests nuevos de `communityTemplates.ts` contra el emulador — reglas de autoría/moderación verificadas: el autor no puede auto-aprobarse, no puede leer/editar el envío de otro, solo puede borrar en `draft`).
- **No verificado en navegador real** (siguiendo el mismo criterio que "no probar flujos de escritura contra Firebase prod" ya establecido para este proyecto — `dev` conecta a producción): la interacción real de geolocalización del navegador y el recorrido completo de envío→aprobación→selección en UI.
