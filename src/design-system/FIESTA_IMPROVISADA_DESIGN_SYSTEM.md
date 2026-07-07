# Sistema de Diseño — Plantilla "Fiesta Improvisada" (PaseLink)

> Referencia oficial para implementar la plantilla en PaseLink con Claude Code.
> Destila el ADN visual de la invitación *Baile Improvisado Vol.1* en un sistema reutilizable, original y propio de PaseLink.
> **No copia** la composición ni activos originales: traslada principios de dirección de arte, color, tipografía y efectos.

---

## 1. Dirección de arte

| Aspecto | Definición |
|---|---|
| **Estilo** | Night-life / rave editorial. Fondo nocturno profundo + neón líquido. Cruce entre flyer de festival y producto tech. |
| **Personalidad** | Joven, atrevida, creativa, con confianza de marca tech que "apenas empieza pero se ve seria". |
| **Público** | 18–30, universitario / creativo local, nativo de Instagram. |
| **Emoción** | Curiosidad + pertenencia ("quiero ser parte del inicio de algo"). Energía sin gritar. |
| **Modernidad** | Alta. Glassmorphism medido, tipografía condensada de impacto, gradientes de neón controlados. |

**Regla rectora:** *máximo impacto, mínima carga.* La energía vive en el fondo y el color; la información permanece plana, nítida y legible.

---

## 2. Color (tokens)

Paleta nocturna con tres neones de acento. Base oscura dominante; el color se usa como **luz**, no como relleno.

### Tokens base (modo oscuro — por defecto)

```css
:root {
  /* Fondo / superficies */
  --fi-bg:            #080510; /* lienzo nocturno */
  --fi-bg-elevated:   #0b0714; /* superficie interior de botones/píldoras */
  --fi-surface:       rgba(255,255,255,0.06); /* tarjeta glass */
  --fi-surface-brd:   rgba(255,255,255,0.16); /* borde glass */
  --fi-hairline:      rgba(255,255,255,0.12); /* separadores internos */

  /* Neones de acento */
  --fi-magenta:       #ff2d78;
  --fi-magenta-soft:  #ff5c96;
  --fi-cyan:          #22e6ff;
  --fi-cyan-soft:     #3df0ff;
  --fi-lime:          #c8ff2d;
  --fi-violet:        #7b2dff;
  --fi-violet-soft:   #b18cff;

  /* Texto */
  --fi-text:          #f6f2ff; /* titulares / valores */
  --fi-text-muted:    #cbc4dc; /* párrafo */
  --fi-text-dim:      #8b83a0; /* metadatos / etiquetas apagadas */

  /* Halos de fondo (blobs) */
  --fi-glow-violet:   #3a0e7a;
  --fi-glow-magenta:  #8a0f3c;
  --fi-glow-cyan:     #0a5a75;
}
```

### Modo claro (opcional, si PaseLink lo requiere)

La plantilla nace oscura. Para modo claro, invertir superficie manteniendo los neones como acento (bajar su saturación ~10% para contraste sobre blanco):

```css
[data-theme="light"] {
  --fi-bg:            #f4f1fb;
  --fi-bg-elevated:   #ffffff;
  --fi-surface:       rgba(20,10,40,0.04);
  --fi-surface-brd:   rgba(20,10,40,0.10);
  --fi-hairline:      rgba(20,10,40,0.10);
  --fi-magenta:       #e01462;
  --fi-cyan:          #0891b2;
  --fi-lime:          #7ba800;
  --fi-violet:        #6d28d9;
  --fi-text:          #17102b;
  --fi-text-muted:    #4a4160;
  --fi-text-dim:      #8b83a0;
}
```

### Roles de color

- **Magenta** = calor, fecha, énfasis primario.
- **Cyan** = tecnología, hora, enlaces / CTA.
- **Lime** = valor / dinero / disponibilidad ("online"). Úsalo con moderación: es el pop más ruidoso.
- **Violet** = ambiente, lugar, halos de fondo.

### Contraste / accesibilidad
- Texto principal `--fi-text` sobre `--fi-bg`: ratio > 14:1. ✅
- Neón sobre oscuro solo para **texto grande** (≥ 32px) o elementos no textuales. Nunca párrafo pequeño en cyan/lime puro sobre oscuro.
- Etiquetas en `--fi-text-dim` deben ir ≥ 14px y en mayúsculas con tracking para legibilidad.

---

## 3. Tipografía

Dos familias, roles fijos.

```css
--fi-font-display: 'Anton', 'Arial Narrow', sans-serif; /* condensada, impacto */
--fi-font-ui:      'Space Grotesk', system-ui, sans-serif; /* UI / cuerpo */
```

- **Anton** — títulos, valores clave (fecha, precio), etiquetas de campo grandes ("DOM", "LUGAR", "$60"). Siempre `text-transform: uppercase`. Nunca para párrafos.
- **Space Grotesk** — párrafos, botones, metadatos, navegación. Pesos 400/500/600/700.

### Escala tipográfica

| Token | Tamaño | Familia | Uso |
|---|---|---|---|
| `--fi-t-hero` | clamp(72px, 18vw, 300px) | display | Título dominante |
| `--fi-t-title` | clamp(48px, 11vw, 200px) | display | Subtítulo del hero |
| `--fi-t-vol` | clamp(40px, 8vw, 100px) | display | Sello / edición |
| `--fi-t-stat` | 64–72px | display | Etiquetas de dato clave |
| `--fi-t-value` | 32–46px | display | Valor de dato (fecha, hora) |
| `--fi-t-h` | 28–34px | ui 700 | Encabezado de sección |
| `--fi-t-body` | 20–22px | ui 500 | Párrafo |
| `--fi-t-label` | 14–19px | ui 600 | Etiqueta, uppercase, tracking |

### Espaciado tipográfico
- Titulares display: `line-height: .8–.85`, `letter-spacing: -0.5px a +2px`.
- Etiquetas: `text-transform: uppercase; letter-spacing: 3–6px`.
- Párrafo: `line-height: 1.45–1.5`; usar `text-wrap: pretty`.

---

## 4. Espaciado

Escala base de 4px. Márgenes de lienzo generosos para respirar sobre el fondo.

```css
--fi-space-1: 4px;   --fi-space-2: 8px;   --fi-space-3: 12px;
--fi-space-4: 16px;  --fi-space-5: 22px;  --fi-space-6: 26px;
--fi-space-7: 34px;  --fi-space-8: 44px;  --fi-space-9: 60px;
--fi-gutter:  90px;  /* margen lateral del lienzo tipo póster (escala en móvil a 24–32px) */
```

Usa **flex/grid con `gap`** para todo grupo de elementos; nunca márgenes por-elemento ni whitespace inline.

---

## 5. Radios de borde

```css
--fi-radius-sm:   12px; /* chips, inputs, botones pequeños */
--fi-radius-md:   20px; /* tarjetas de dato individuales */
--fi-radius-lg:   34px; /* tarjeta glass principal */
--fi-radius-pill: 999px; /* botones CTA, badges */
```

---

## 6. Sombras y elevación

```css
--fi-shadow-card:  0 30px 80px rgba(0,0,0,0.5);          /* tarjeta glass */
--fi-shadow-cta:   0 0 50px rgba(123,45,255,0.5);        /* halo bajo CTA */
--fi-inset-vig:    inset 0 0 320px 60px rgba(0,0,0,0.7); /* viñeta del lienzo */
```

**Glow de neón** (para títulos/acentos — usar con criterio; ver §11 sobre export):
```css
--fi-glow-magenta-txt: 0 0 26px rgba(255,45,120,0.6);
--fi-glow-cyan-txt:    0 0 24px rgba(34,230,255,0.6);
```
> ⚠️ El `text-shadow` de neón se ve genial en pantalla pero puede generar "fantasma" al rasterizar a imagen. Para piezas que se exportan como PNG, sustituir el glow del texto por un **halo de fondo** (gradiente radial detrás del texto).

---

## 7. Fondos y textura (el corazón del estilo)

El fondo es lo que da vida. Receta:

1. **Lienzo** `--fi-bg` sólido.
2. **Blobs de neón** — 2–3 círculos con gradiente radial, colocados fuera de los bordes, semitransparentes. En web pueden llevar `filter: blur(60–70px)`; para export usar gradientes suaves sin blur (evita costuras).
   ```css
   .fi-blob{ position:absolute; border-radius:50%;
     background: radial-gradient(circle at 45% 45%, var(--fi-violet) 0%, var(--fi-glow-violet) 40%, transparent 70%);
     opacity:.8; }
   ```
3. **Viñeta** — `box-shadow: var(--fi-inset-vig)` en una capa `inset:0; pointer-events:none` para hundir los bordes.
4. **Chispas** opcionales — 3–4 puntos de 6–8px con `box-shadow` de color (micro-luces).
5. **Rejilla tech** opcional (variante alterna) — líneas a 60px con máscara radial que se desvanece a los bordes.

Capas, de atrás a adelante: `bg → blobs → viñeta → contenido`.

---

## 8. Componentes

### Tarjeta glass (contenedor principal)
```css
.fi-card{
  background: var(--fi-surface);
  border: 1px solid var(--fi-surface-brd);
  border-radius: var(--fi-radius-lg);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: var(--fi-shadow-card);
  padding: var(--fi-space-8);
}
```

### Fila de dato (dato dentro de la tarjeta)
Etiqueta display neón (ancho fijo) + valor. Separadas por hairline.
```
[ ETIQUETA display neón · min-width fijo ]   [ valor ]
———————————————— hairline ————————————————
```
- Etiqueta: `--fi-font-display`, color neón por rol, `min-width: 130px`.
- Divisor entre valores en línea: barra vertical de 3px con gradiente cyan→magenta.

### Botón CTA (píldora con borde de gradiente)
```css
.fi-cta{
  border-radius: var(--fi-radius-pill);
  padding: 3px; /* grosor del borde gradiente */
  background: linear-gradient(90deg, var(--fi-magenta), var(--fi-violet), var(--fi-cyan));
  box-shadow: var(--fi-shadow-cta);
}
.fi-cta__inner{
  border-radius: var(--fi-radius-pill);
  background: var(--fi-bg-elevated);
  display:flex; align-items:center; justify-content:center; gap:16px;
  padding: 0 40px; height: 124px;
}
```
Texto interior: título en display + subtítulo en `--fi-cyan-soft` uppercase.

**Variantes:** primaria (gradiente completo, arriba), secundaria (borde `--fi-surface-brd` de 1.5px, fondo transparente), fantasma (solo texto neón).

### Chip / badge
Píldora `--fi-radius-pill`, borde 1.5px de acento a 40% alpha, fondo del acento a 6%, texto uppercase tracking. Punto de estado opcional (lime con box-shadow) para "online".

### Encabezado de sección
Kicker uppercase en neón (tracking 6–10px) → título display. Opcional: reglas horizontales con gradiente que enmarcan el kicker.

### Input / campo (para formularios de registro en la app)
```css
.fi-input{
  background: var(--fi-surface);
  border: 1px solid var(--fi-surface-brd);
  border-radius: var(--fi-radius-sm);
  color: var(--fi-text);
  padding: 14px 18px;
  font-family: var(--fi-font-ui);
}
.fi-input:focus{ outline:none; border-color: var(--fi-cyan); box-shadow: 0 0 0 3px rgba(34,230,255,.25); }
```

### Separador
- Hairline: `1px solid var(--fi-hairline)`.
- Acento: barra de 2–3px con `linear-gradient(90deg, transparent, var(--fi-cyan), transparent)`.

### Íconos
- Estilo lineal, 2–2.5px de trazo, esquinas vivas. Color por rol.
- **Evitar emoji** en producto. Preferir set lineal (Lucide/Phosphor).
- Recurso de marca: **corchetes de esquina** (reticle tipo escáner) — cita el marco del logo de PaseLink; úsalo para enmarcar zonas destacadas (QR, CTA).

---

## 9. Animaciones

Sutiles, ambientales, nunca distraen del texto. `prefers-reduced-motion` debe desactivarlas.

```css
@keyframes fi-float { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(0,-26px) scale(1.06)} }
@keyframes fi-drift { 0%,100%{transform:translate(0,0)} 50%{transform:translate(30px,20px)} }
@keyframes fi-rise  { 0%{transform:translateY(0);opacity:.9} 100%{transform:translateY(-140px);opacity:0} }
@keyframes fi-eq    { 0%,100%{transform:scaleY(.25)} 50%{transform:scaleY(1)} } /* ecualizador */
```
- **Blobs**: `fi-float` / `fi-drift` 8–16s, ease-in-out, infinito.
- **Chispas**: `fi-rise` 4–5s lineal.
- **Ecualizador** (barras de color): `fi-eq` 0.8–1.3s desfasadas — motivo de "música/movimiento".
- Duraciones largas = ambiente; nunca > sutil.

```css
@media (prefers-reduced-motion: reduce){ *{animation:none !important} }
```

---

## 10. Microinteracciones

- **Botón hover**: brillo del halo +20%, escala 1.02, transición 180ms ease-out.
- **Botón active**: escala 0.98.
- **Tarjeta/dato hover**: borde de `--fi-surface-brd` → acento a 40%.
- **Focus visible**: anillo `box-shadow 0 0 0 3px rgba(cyan,.25)` en todo control.
- **Entrada de contenido** (si aplica): fade + translateY(16px), stagger 60ms por elemento.

---

## 11. Notas de implementación / mantenimiento

- **Responsive**: el lienzo tipo póster (1080×1920) es solo el caso "story". En app, usar los mismos tokens con `--fi-gutter` reducido a 24–32px y tipografía en `clamp()`. Layout con grid/flex + gap.
- **Accesible**: respeta contraste (§2), `prefers-reduced-motion`, focus visible, jerarquía semántica (`h1/h2`, `<button>`, `<label>`).
- **Export a imagen**: si una pieza se rasteriza (compartir por mensaje), quitar `text-shadow`/`filter:blur` del texto y de los blobs; sustituir por halos de fondo con gradiente radial. Renderiza a 2× y reduce para bordes nítidos.
- **Mantenible**: todos los valores viven en tokens `--fi-*`. Cambiar la marca = cambiar tokens, no componentes.
- **Reutilizable**: componentes independientes (card, cta, data-row, chip, header, input) que se componen. No acoplar al contenido del evento.
- **No tocar la arquitectura** de PaseLink: esta guía define solo la **capa de identidad visual** (tokens + componentes de la plantilla), integrable con el sistema de temas existente.

---

## 12. Qué hace única a la plantilla (resumen del ADN)

1. **Oscuridad como lienzo, neón como luz** — el color nunca rellena, ilumina.
2. **Contraste de tipografías**: condensada de impacto (Anton) vs. grotesca limpia (Space Grotesk).
3. **Glass sobre neón**: la tarjeta translúcida flota sobre halos de color → profundidad real por capas.
4. **Dato como titular**: etiquetas (DOM, LUGAR, $60) tratadas como tipografía de cartel, no como texto de formulario.
5. **Movimiento ambiental**: blobs, chispas y ecualizador evocan música sin animar el texto.
6. **Guiño de marca**: corchetes de esquina que citan el marco del logo de PaseLink.

> El resultado se percibe moderno porque combina *glassmorphism medido*, *gradientes de neón controlados* y *tipografía editorial de festival* — sin caer en sobrecarga. Llama la atención por el contraste luz/oscuridad; genera dinamismo por el movimiento lento del fondo y el color como acento puntual.
