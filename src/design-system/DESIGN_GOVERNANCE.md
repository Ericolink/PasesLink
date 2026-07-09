# Design Governance Layer — sistema de temas de PaseLink

Este documento es un contrato, no una guía de estilo. Define los límites
obligatorios del sistema de temas de invitación (`registry.ts`,
`templates.css`, `ornaments.tsx`, `seals.ts`). Cualquier cambio a un tema
existente o la incorporación de uno nuevo debe cumplirlo.

## Principios base

- El sistema de temas es **controlado, no libre**. No es un playground
  visual: cada tema opera dentro de un contrato compartido.
- Los temas solo modifican **identidad visual** (paleta, tipografía,
  forma, materialidad, sombra, micro-interacción). Nunca modifican
  **estructura del producto** (orden de bloques, componentes, superficies
  que existen, alcance de páginas).
- Identidad y estructura no son negociables en direcciones opuestas: la
  identidad es libre dentro de su propio tema; la estructura es fija para
  los cinco temas (y para cualquiera que se agregue después).

## Estructura inmutable (OBLIGATORIA)

Todos los temas deben respetar el mismo orden de bloques de la
invitación:

```
Título → Ornamento → Detalles → Invitado → QR → Acciones → Mensajes → Muro
```

Ningún tema reordena, esconde o duplica un bloque de esta secuencia.
Variar la identidad de un bloque (color, tipografía, forma) está permitido;
moverlo, quitarlo o agregar uno nuevo no lo está.

Este contrato rige la invitación en pantalla (`GuestPass.tsx` visible). El
boleto exportable (`GuestPassTicket.tsx`, generado por "Descargar pase") es
un artefacto distinto — hereda la paleta/tipografía/ornamentos del tema
pero, a propósito, no incluye Acciones, Mensajes ni Muro: no es una
violación de este contrato, es un documento con otro propósito.

## Superficies obligatorias (6 por tema)

Todo tema debe implementar **exactamente** estas seis superficies — ni
más, ni menos:

1. Fondo
2. Tipografía de título (`h1`)
3. Card principal (`.invite-card`)
4. Divisor / ornamento (`.invite-divider-line` + `ThemeOrnament`)
5. Muro (`.invite-wall-message` / `.invite-wall-form`)
6. Botón primario (`.bg-primary`)

Un tema con menos de seis se percibe incompleto. Un tema con más de seis
desbalancea el sistema frente al resto (deriva por acumulación). Antes de
agregar una séptima superficie a un tema, hay que preguntarse si las otras
cuatro la necesitan también — si la respuesta es no, no se agrega.

## Materialidad exclusiva

Cada tema tiene un lenguaje visual propio que no se reutiliza en otro
tema:

| Tema | Materialidad |
|---|---|
| Graduación | institucional (foil, guilloché, marco) |
| Bodas | papel algodón + floral |
| Vaquera | rústico / material táctil (cuero, madera) |
| Infantil | confeti controlado |
| Formal | minimal metálico sobrio (doble filete) |
| Fiesta improvisada | night-life editorial / neón líquido (lienzo nocturno + halos de neón violeta/magenta/cian como iluminación de fondo, boleto de vidrio flotando con franja superior de neón, sello y badges como halo de luz — ver [`FIESTA_IMPROVISADA_DESIGN_SYSTEM.md`](./FIESTA_IMPROVISADA_DESIGN_SYSTEM.md)) |

Un recurso asignado a un tema (grano de papel, marco institucional,
confeti, etc.) no aparece en ningún otro, aunque el efecto sería "bonito"
ahí también. Es la regla que evita que dos temas converjan visualmente
con el tiempo.

## Alcance del sistema

El sistema de temas aplica **solo** a la capa de invitación:

- UI de invitación (`InvitationCard`, `InvitationThemeRoot`)
- Wall / mensajes (`WallSection`, muro embebido en la invitación)
- Botones / acciones de esa misma capa
- Preview de invitación (`InvitationPreview`)

**Excluido** de este sistema (salvo decisión explícita y separada):

- Dashboard del organizador (`EventDetail.tsx`, etc.)
- Reports / analytics (`Reports.tsx`)
- Backend
- Auth

**Extensión explícita (2026-07):** los "tickets" de `Dashboard.tsx` (Mis
eventos) y `MyInvitations.tsx` (Mis invitaciones) sí toman identidad de
plantilla, vía `src/templates/ticketTheme.ts` — reutiliza `registry.ts`
tal cual, sin tokens nuevos. No es una ampliación del alcance de este
documento: sigue sin aplicar a `EventDetail.tsx`, `Reports.tsx` ni al
resto del dashboard/organizador. La regla de "solo el título hereda
`--invite-font`, nunca las etiquetas chicas" (legibilidad a tamaño
reducido) vive en `EventTicketCard.tsx`, no acá.

**Extensión explícita (2026-07-09):** el dashboard del organizador/
coanfitrión (`EventDetail.tsx`, `Reports.tsx`, `Scanner.tsx`, y por
herencia `GuestList/*`, los sheets/diálogos portados como
`GuestDetailSheet`/`ConfirmDialog`, `EditEventForm`, etc.) ahora toma
identidad de plantilla — paleta de acento, ambiente de fondo, borde de
tarjetas e iconografía decorativa — vía un mecanismo **separado** de este
documento:

- `src/templates/dashboardTheme.ts` (`buildDashboardThemeVars`, mismo
  guard `default` = no-op que `ticketTheme.ts`) + `src/hooks/
  useDashboardTheme.ts`, que setea `data-dash-template` y las custom
  properties `--color-primary*`/`--invite-accent*` en
  `document.documentElement` (no en un wrapper JSX: `GuestDetailSheet` y
  `ConfirmDialog` se montan vía `createPortal` en `document.body`, fuera
  de cualquier árbol de página).
- El atributo `data-dash-template` es distinto de `data-template` a
  propósito: el dashboard **no** está sujeto al contrato de "6 superficies
  obligatorias" ni de "materialidad exclusiva" de este documento — esas
  reglas siguen rigiendo únicamente la capa de invitación. El tratamiento
  del dashboard es deliberadamente más sobrio y sistemático (una sola
  regla de acento por tipo de superficie, no una materialidad por tema) y
  nunca reemplaza color de texto ni fondos de lectura (`text-gray-900`,
  `bg-white dark:bg-gray-800` quedan intactos) — solo bordes, halos
  ambientales de baja opacidad e iconografía decorativa.
- `Navbar.tsx`/`BottomTabBar.tsx` (clases `.app-header`/`.app-tabbar` en
  `index.css`) quedan explícitamente pineados al rosa de marca: son chrome
  visible en todas las rutas, no "parte del evento".
- `Scanner.tsx` tiene alcance reducido a propósito: solo el acento de
  botones/links (vía `--color-primary`), sin el ambiente de fondo ni el
  borde de tarjetas — es la pantalla de check-in, operada bajo presión en
  la puerta, y ya vive dentro de `.theme-reset` (sub-tema oscuro fijo
  pensado para legibilidad en exteriores).
- `Dashboard.tsx` (lista de *varios* eventos) y `AdminDashboard.tsx`
  (panel de super-admin de PaseLink) quedan explícitamente fuera: no hay
  un `templateId` único al que atar el shell de esas páginas.
- Antes de esta extensión, `EventDetail.tsx`/`Reports.tsx` tenían un
  condicional puntual que envolvía el contenido en `InvitationThemeRoot`
  **solo** para `cowboy`/`graduation`, lo que les daba además la animación
  de entrada propia del tema (`animate-bounce-in`/`animate-slide-in-up`
  vía `getEnterAnimationClass`). Ese condicional se eliminó a favor del
  mecanismo uniforme de arriba, y la animación de entrada del dashboard
  queda fija en `animate-fade-in` para los 7 temas — es una pérdida
  deliberada, no un olvido: el dashboard no tiene materialidad ni
  micro-interacción exclusiva por tema (eso sigue siendo específico de la
  invitación), así que cowboy/graduation dejan de ser una excepción
  también en esto.

## Regla de evolución

> El proceso obligatorio que opera esta regla — clasificación del cambio,
> validaciones y veredicto final — está definido en
> [`DESIGN_DIFF_REVIEWER.md`](./DESIGN_DIFF_REVIEWER.md). Debe ejecutarse
> antes de cualquier modificación a `src/styles/templates.css`.

Antes de cambiar cualquier tema, validar en este orden:

1. ¿El cambio modifica **identidad** (paleta, tipografía, forma,
   materialidad, sombra, micro-interacción) o modifica **estructura**
   (orden de bloques, componentes, superficies, alcance)?
2. ¿El cambio afecta a otros temas, o queda contenido en su propio
   `[data-template='x']`?
3. ¿El tema sigue respetando exactamente las 6 superficies obligatorias
   después del cambio?

**Si hay conflicto en cualquiera de las tres preguntas, el cambio no es
válido** — no se implementa hasta resolver el conflicto, nunca se hace una
excepción puntual "por esta vez".
