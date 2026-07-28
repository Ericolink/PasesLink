# Cómo agregar una plantilla nueva

Guía práctica, complementaria a `DESIGN_GOVERNANCE.md` (que define el contrato de qué es "libre" vs "fijo" por tema — leerlo primero si no se conoce). Este documento es el checklist mecánico: qué archivos tocar y en qué orden.

## 1. Un objeto en `src/templates/registry.ts`

Cada plantilla es una entrada de `INVITATION_TEMPLATES`. No hace falta ningún componente React nuevo — `id`, `label`, `category`, `description` y el bloque `vars` alcanzan para que la plantilla aparezca en `TemplatePicker` y renderice en `GuestPass`/`EventWall`/`InvitationPreview` sin tocar esos archivos.

```ts
{
  id: 'nuevo-tema',        // agregar también a TemplateId en src/types/index.ts
  label: 'Nombre visible',
  category: 'Categoría',
  description: 'Una oración editorial para la galería.',
  adminOnly: true,          // opcional: debut como evento propio antes de abrir al público
  vars: {
    accent, accentDark, accentSoft, pageBg, surface, text, textMuted, border,
    fontFamily, borderRadius, shadow, enterAnimation,
    confettiShape,          // opcional
    secondaryFontFamily,    // opcional (Feature 2) — cuerpo de lectura larga (FAQ, transporte, secciones custom)
    buttonVariant,          // opcional (Feature 2) — 'solid' (default) | 'outline'
    spacingScale,           // opcional (Feature 2) — reservado, sin efecto visual todavía
  },
}
```

`TemplateId` es una unión cerrada (`src/types/index.ts`) a propósito: agregar el id ahí es lo que hace que TypeScript exija también la entrada en `registry.ts` — evita plantillas "fantasma" referenciadas desde un evento pero sin definición visual.

## 2. Verificar contraste antes de cerrar la paleta

`accent`/`accentDark`/`textMuted` deben pasar 4.5:1 contra `surface`/`accentSoft` (WCAG AA) — se usan en texto real (horario, enlaces), no solo decorativo. Ver los comentarios de auditoría de accesibilidad en `wedding`/`kids` dentro de `registry.ts` para el criterio exacto (mismo matiz, oscurecer hasta cruzar el umbral).

## 3. Decoración exclusiva en `src/styles/templates.css`

Todo lo que hace que el tema se sienta distinto de los demás (texturas de fondo, pseudo-elementos, formas de card/badge, animaciones puntuales) va en un bloque nuevo `[data-template='nuevo-tema'] { ... }` — nunca reutilizar la materialidad de otro tema (ver "Materialidad exclusiva" en `DESIGN_GOVERNANCE.md`).

Las ~15 propiedades que SÍ están tokenizadas (fondo, texto, borde, radio, sombra, tipografía) deben leerse de `var(--invite-*)`, nunca repetirse como literales — esas ya viajan solas desde `registry.ts` vía `buildInviteThemeStyle()`, no hace falta declararlas de nuevo por tema.

Checklist de superficies obligatorias (igual para los 7 temas existentes): fondo, h1, `.invite-card`, divisor/ornamento, muro, botón primario.

## 4. Variante de botón "outline" (opcional)

Si el tema declara `buttonVariant: 'outline'`, el bloque compartido al final de `templates.css` (sección "COMPARTIDO ENTRE TEMAS") ya la resuelve automáticamente sobre `.invite-btn-primary` — no hace falta CSS propio del tema para esto.

## 5. Opcional: ornamento propio

`src/templates/ornaments.tsx` puede recibir un SVG nuevo para `ThemeOrnament` si el tema lo amerita — no es obligatorio, `TemplatePicker`/`ThemeOrnament` ya caen a un ornamento genérico si no hay uno específico.

## 6. Qué NUNCA hace falta tocar

`InvitationThemeRoot.tsx`, `InvitationCard.tsx`, `InviteDivider.tsx`, `WallSection.tsx`, `ThemeSeal.tsx`, `GuestPass.tsx`, `TemplatePicker.tsx` — todos leen el tema por variables CSS y el `data-template`/`data-button-variant` que ya aplica `InvitationThemeRoot`. Si agregar una plantilla obliga a tocar alguno de estos, es señal de que algo se está poniendo en la columna "fija" del contrato de `DESIGN_GOVERNANCE.md` sin deber estarlo.

## Personalización por evento (Feature 2)

El organizador puede pisar `accent` (color de acento) y, desde `EditEventForm`/`StepImageAndColors`, `secondaryFontFamily` (3 opciones curadas, ver `SECONDARY_FONT_OPTIONS` en `registry.ts`) y `buttonVariant` — vía `EventData.themeOverrides`, el mismo mecanismo `overrides` de `buildInviteThemeStyle()` que ya existía para `accentColor`. `spacingScale` queda deliberadamente fuera de lo editable: varios temas tienen decoraciones con medidas absolutas que un spacing distinto rompería.
