# Auditoría global del ecosistema de plantillas — PaseLink

Documento de diagnóstico y priorización. No implementa nada — define
dónde está cada plantilla respecto al nivel de Vaquera/Graduación y qué
orden de trabajo cierra la brecha sin violar
[`DESIGN_GOVERNANCE.md`](./DESIGN_GOVERNANCE.md).

Checklist de referencia (12 superficies, pedidas por el negocio): Hero,
Tipografía, Fondo, Divisor/ornamento, Mapa, QR, Muro, Estados de
confirmación (RSVP/pago/check-in), Badges, Botones, Dashboard del
organizador, Stat cards, Estados vacíos/placeholders.

---

## 0. Hallazgo principal (transversal, afecta a las 6 plantillas)

**El dashboard del organizador (`EventDetail.tsx`, `Reports.tsx`,
`EventWall.tsx`) solo se tematiza para Vaquera y Graduación.** Es un
`if` explícito en código, no una omisión de CSS:

```ts
if (event.templateId === 'cowboy' || event.templateId === 'graduation') {
  return <InvitationThemeRoot ...>{content}</InvitationThemeRoot>
}
return <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">{content}</div>
```
([EventDetail.tsx:540](../pages/EventDetail.tsx#L540), patrón idéntico en
[Reports.tsx:187](../pages/Reports.tsx#L187) y
[EventWall.tsx:228](../pages/EventWall.tsx#L228) y `:482`)

Para Bodas, Formal, Infantil y Default, el organizador nunca ve su tema
fuera de la invitación misma: el dashboard es 100% chrome genérico de la
app, con o sin modo oscuro. Esto es la causa raíz de por qué esas tres
plantillas "se sienten genéricas" más allá de la tarjeta de invitación —
no es un problema de paleta, es un problema de alcance.

Las páginas orientadas al invitado (`GuestPass`, `EventJoin`,
`EventArrive`, `WallSection`) **sí** envuelven siempre en
`InvitationThemeRoot`, para los 6 temas. La brecha es específicamente
organizador, no invitado.

Otros tres hallazgos transversales, válidos incluso para Vaquera/Graduación:

- **Mapa**: de los 6 temas, solo Vaquera trata el `iframe` del mapa
  (`filter: sepia(.35) saturate(.85) contrast(1.05)`,
  [templates.css:147](../styles/templates.css#L147)). Ni Graduación —la
  segunda plantilla más trabajada— le da identidad al mapa. Es una
  superficie completamente huérfana en 5 de 6 temas.
- **Sello (`ThemeSeal`)**: solo existe para Graduación
  ([seals.ts](../templates/seals.ts)). Es deliberado, no un bug — pero
  significa que ningún otro tema tiene un "objeto de validación" propio
  en sus momentos de logro (RSVP confirmado, pago, check-in): todos caen
  en el mismo pill `.invite-badge-positive` coloreado por tokens, sin
  forma.
- **Estados vacíos del dashboard** (`Reports.tsx`: "Aún no hay check-ins
  registrados.") usan clases Tailwind literales (`text-gray-500`), no
  tokens `--invite-*`. Para Vaquera/Graduación esto igual queda corregido
  porque esas dos plantillas remapean `.text-gray-500` globalmente
  ([templates.css:427](../styles/templates.css#L427)); para el resto no
  hay remapeo porque no hay `InvitationThemeRoot` que lo cubra. El muro
  (`WallSection`) en cambio sí usa tokens nativamente en los 6 temas — la
  brecha es 100% del lado dashboard.
- **QR**: el código en sí (los módulos negros) nunca se tematiza en
  ningún tema — correcto, no tocar (ver Riesgos). El marco alrededor
  (`border` + `var(--invite-border)`) es idéntico y genérico en los 6
  temas, Vaquera/Graduación incluidos: no es una brecha de paridad, es
  una superficie que ningún tema resolvió todavía.
- Nota al margen: `src/components/QRCodeCard.tsx` no se usa en ninguna
  página (`grep` no encuentra imports) — es código muerto, fuera del
  alcance de esta auditoría de experiencia real.

---

## 1. Bodas

| Superficie | Estado |
|---|---|
| Hero/portada | Sin tratamiento — `.invite-cover` genérico, sin filtro, viñeta ni radio propio |
| Tipografía | **Fuerte** — Playfair Display itálica (h1) + Cormorant Garamond (cuerpo), tracking e interlineado cuidados |
| Fondo | **Fuerte** — grano de papel algodón + 4 manchas doradas irregulares |
| Divisor/ornamento | Ornamento (ramita floral) excelente, pero `.invite-divider-line` **nunca se sobreescribe** — la línea bajo el ornamento es la genérica gris de `default` |
| Mapa | Sin tratamiento (gap transversal) |
| QR | Genérico (gap transversal) |
| Muro | Solo color + radio (1.25rem); ninguna textura/objeto propio |
| Confirmaciones | Pill coloreado por tokens, sin sello ni forma propia |
| Badges | Sin tratamiento |
| Botones | Hover `brightness(1.08)` — correcto, modesto |
| Dashboard | 0% — no envuelto en `InvitationThemeRoot` |
| Stat cards | N/A (consecuencia del punto anterior) |
| Estados vacíos | Muro tokenizado; dashboard genérico |

**Fortalezas**: tipografía y fondo están al nivel de Vaquera/Graduación —
es la pieza mejor resuelta de las tres plantillas "huérfanas".

**Debilidades**: la identidad se concentra en 2 de 12 superficies. El
divisor desnudo es la inconsistencia más visible: cada vez que aparece el
ornamento floral, cuelga de una línea sin relación con la paleta dorada.

**Oportunidades** (orden esfuerzo→impacto):
1. Filete del divisor: clonar el patrón ya validado de Formal
   (`border-top-color` + `box-shadow` de una línea, 3 líneas de CSS).
2. Cover/hero: viñeta cálida sutil + heredar el `border-radius: 1.5rem`
   del tema (hoy `.invite-cover` lo ignora).
3. Muro: un detalle de objeto propio (p. ej. filete dorado superior fino
   o un monograma esquinero) — nunca el tablón de Vaquera ni el marco de
   Graduación.
4. Dashboard: replicar el patrón de Vaquera/Graduación
   (`EventDetail`/`Reports`/`EventWall` envueltos cuando
   `templateId==='wedding'`, mismo set mínimo: fondo de página, botones,
   texto, stat-card, botones secundarios).

**Riesgos**: papel + dorado cálido ya es vocabulario compartido con
Graduación (foil) — cualquier ornamentación nueva debe seguir siendo
"floral/orgánica", nunca un marco ni grano más fuerte, para no converger.

**Dirección creativa**: "papelería de invitación impresa". Ya está bien
encaminada; falta aplicar lo que existe (paleta, ornamento) a las
superficies que hoy quedan desnudas — no sumar motivos nuevos.

**Prioridad: Alta.** Mayor ROI del grupo: dos superficies de referencia
ya resueltas, el resto es trabajo barato de extender, no de inventar.

---

## 2. Evento formal

| Superficie | Estado |
|---|---|
| Hero/portada | Sin tratamiento — coherente con el minimalismo, pero el doble filete (firma del tema) no llega al cover |
| Tipografía | **Fuerte** — Cormorant Garamond (h1) + Space Grotesk (cuerpo), tracking amplio |
| Fondo | Minimalista a propósito (dos gradientes lineales sutiles) — correcto, no es un gap |
| Divisor/ornamento | **Ya resuelto** — único de los tres huérfanos con doble filete propio en dos tonos del metal |
| Mapa | Sin tratamiento (gap transversal) |
| QR | Genérico (gap transversal) |
| Muro | Solo filete superior 2px en acento — funcional pero sin ningún otro detalle |
| Confirmaciones | Pill genérico, sin sello |
| Badges | Sin tratamiento |
| Botones | Hover `brightness(1.05)` + tracking — correcto |
| Dashboard | 0% |
| Stat cards | N/A |
| Estados vacíos | Mismo patrón que Bodas |

**Fortalezas**: tipografía y divisor ya están al nivel de referencia —
de los tres huérfanos, Formal es el que menos trabajo necesita para
emparejar, porque lo poco que tiene está bien resuelto, no a medias.

**Debilidades**: hero, muro, confirmaciones y dashboard sin identidad.

**Oportunidades**:
1. Extender el filete del cover (mismo mecanismo del divisor) cuando hay
   foto — esfuerzo mínimo.
2. Dashboard — mismo punto que Bodas, mayor impacto del grupo.
3. Muro: una "placa de mesa" mínima (filete + quizás iniciales) en vez de
   sello redondo (ya territorio de Graduación).

**Riesgos**: el minimalismo ES la identidad de Formal — el riesgo
principal es sobrecargarlo "para emparejar" con temas más densos.
Vigilar que el titular no converja con Graduación (ambos serif +
tracking); hoy están diferenciados porque Formal no usa mayúsculas.

**Dirección creativa**: "papelería corporativa de gala" — restraint es
la marca. Cerrar lo poco que falta sin sumar densidad.

**Prioridad: Media-alta.** Menos esfuerzo que Bodas para llegar a
paridad real.

---

## 3. Fiesta infantil

| Superficie | Estado |
|---|---|
| Hero/portada | Sin tratamiento (gap compartido) |
| Tipografía | Baloo 2 ya es expresiva, pero **sin jerarquía h1/cuerpo** — el h1 solo cambia weight/letter-spacing, sigue siendo la misma fuente que el body (a diferencia de los otros 4 temas no-default, que todos separan display/body) |
| Fondo | **Fuerte** — confeti en 3 capas, bien resuelto |
| Divisor/ornamento | Ornamento (confeti) bueno, pero `.invite-divider-line` **nunca se sobreescribe** — mismo gap exacto que Bodas |
| Mapa | Sin tratamiento (gap transversal) |
| QR | Genérico (gap transversal) |
| Muro | Solo filete superior 3px — sin motivo de "fiesta" propio |
| Confirmaciones | Pill genérico — irónico: es el momento donde un detalle de confeti encajaría mejor, y el JS ya dispara `confetti()` con `confettiShape` en el check-in, pero el badge en sí queda neutro |
| Badges | Sin tratamiento |
| Botones | **Fuerte** — bounce sutil (`scale(1.04)`/`scale(.97)`), coherente con el tono juguetón |
| Dashboard | 0% |
| Stat cards | N/A |
| Estados vacíos | Mismo patrón |

**Fortalezas**: fondo y botón ya transmiten "fiesta cuidada" sin caer en
caótico.

**Debilidades**: tipografía sin jerarquía, divisor desnudo, muro sin
motivo propio, dashboard 0%.

**Oportunidades**:
1. Divisor: mismo fix de 3 líneas que Bodas — el más barato de los tres.
2. Tipografía: subir el weight del h1 (700/800) dentro de la misma
   familia ya cargada — crea jerarquía sin sumar una fuente nueva.
3. Muro: motivo de esquina con el mismo confeti del `KidsOrnament`, vía
   `mask-image` (mismo mecanismo que las esquinas de Vaquera).
4. Dashboard — mismo punto que el resto.

**Riesgos**: es el tema con más riesgo de "infantilizarse" de más si se
sobrecarga — la propia documentación del sistema ya insiste en "confeti
controlado, no caja de crayones". Cualquier adición debe ser sutil.

**Dirección creativa**: mantener "fiesta cuidada"; cerrar jerarquía
tipográfica antes que sumar motivos nuevos.

**Prioridad: Media.** Menos urgente que Bodas/Formal (ya tiene 2
superficies fuertes), pero el gap tipográfico es barato de cerrar.

---

## 4. Predeterminado (Default)

Default es, por diseño, el control group: sin ornamento, sin sello,
sigue el modo oscuro de la app. No se audita contra el mismo estándar que
el resto — esa es su función ([registry.ts:40](../templates/registry.ts#L40),
`ThemeOrnament` retorna `null` si no hay entrada en `ORNAMENTS`).

**Recomendación: no tocar.** El único riesgo real es de proceso, no de
diseño: que alguien lo confunda con "una plantilla más a la que le falta
trabajo" en medio de esta ronda. No es eso — es el baseline.

---

## 5. Notas sobre Vaquera y Graduación (la referencia, no están a 100%)

Aun siendo el estándar, ninguna de las dos cubre las 12 superficies:

- **Mapa sin tratamiento en Graduación** — el dorado institucional nunca
  toca el `iframe`. Es la única superficie huérfana de esta plantilla.
- **Sello exclusivo de Graduación** — correcto y deliberado (Vaquera
  resuelve sus momentos de logro con la credencial de sheriff
  `.invite-badge-positive`/`.invite-badge-icon`, no necesita sello).
- **Cobertura del dashboard en modo claro es deliberadamente parcial** —
  ni Vaquera ni Graduación repintan cada `bg-white` de tarjeta en modo
  claro, solo fondo de página, botones, texto y stat-cards; el repintado
  de `bg-white`/`border-gray-*` con `!important` solo se activa en modo
  oscuro (`.dark [data-template='cowboy'] .bg-white`, etc.) para evitar
  que el chrome oscuro de la app choque con el tema. Es la proporción
  correcta a copiar — no significa "repintar todo el dashboard".

Estos dos puntos (mapa, dashboard-proporcional) son la plantilla de
trabajo que se debe replicar en los otros temas, no un techo a superar.

---

## 6. Tabla comparativa de paridad

| Superficie | Vaquera | Graduación | Bodas | Formal | Infantil | Default |
|---|---|---|---|---|---|---|
| Hero/portada | ✅ rico | — | ❌ | ❌ | ❌ | n/a |
| Tipografía | ✅ | ✅ | ✅ | ✅ | ⚠️ sin jerarquía | n/a |
| Fondo | ✅ | ✅ | ✅ | ✅ (minimal a propósito) | ✅ | n/a |
| Divisor/ornamento | ✅ | ✅ | ⚠️ ornamento sí, línea no | ✅ | ⚠️ ornamento sí, línea no | n/a |
| Mapa | ✅ | ❌ | ❌ | ❌ | ❌ | n/a |
| QR | ⚠️ genérico | ⚠️ genérico | ⚠️ genérico | ⚠️ genérico | ⚠️ genérico | n/a |
| Muro (objeto propio) | ✅ rico | ✅ rico | ❌ | ❌ | ❌ | n/a |
| Confirmaciones (sello/forma) | ✅ (credencial) | ✅ (sello) | ❌ | ❌ | ❌ | n/a |
| Badges | ✅ | ⚠️ parcial | ❌ | ❌ | ❌ | n/a |
| Botones | ✅ | ✅ | ✅ | ✅ | ✅ | n/a |
| Dashboard organizador | ✅ | ✅ | ❌ | ❌ | ❌ | n/a |
| Stat cards | ✅ | ✅ | ❌ | ❌ | ❌ | n/a |
| Estados vacíos | ✅ (vía dashboard) | ✅ (vía dashboard) | ⚠️ solo muro | ⚠️ solo muro | ⚠️ solo muro | n/a |

✅ resuelto · ⚠️ parcial · ❌ ausente

---

## 7. Estrategia de paridad visual (sin sobrecargar)

**Principio rector**: paridad se mide por superficies *vacías* cerradas,
no por volumen de CSS agregado. El `DESIGN_GOVERNANCE.md` ya pone un
techo (~2x de densidad entre temas) — la meta es subir el piso de Bodas/
Formal/Infantil, no subir el techo de Vaquera/Graduación.

**Reglas de proceso**:
1. Ningún tema gana una 7ª superficie sin que se evalúe si los otros 5
   también la necesitan (regla ya escrita en `DESIGN_GOVERNANCE.md`).
2. Cerrar superficies en **0** (ausentes) siempre antes que enriquecer
   superficies que ya están en ✅ o ⚠️.
3. Todo recurso visual nuevo se registra primero en la tabla de
   "materialidad exclusiva" antes de implementarse, para no converger
   (p. ej.: ningún tema nuevo puede usar un sello redondo — es de
   Graduación; ninguno puede usar grano de papel — es de Bodas).
4. Cada cambio a `templates.css` pasa por el proceso de
   `DESIGN_DIFF_REVIEWER.md` antes de escribirse.

**Plan de oleadas** (cada una entrega valor por sí sola, sin depender de
las siguientes):

| Oleada | Qué cierra | Temas que tocael | Esfuerzo |
|---|---|---|---|
| 1 | Dashboard organizador (extender el patrón de Vaquera/Graduación, misma proporción claro/oscuro) | Bodas, Formal, Infantil | Medio — mayor impacto estructural del plan |
| 2 | Divisor con filete propio (clonar patrón de Formal) | Bodas, Infantil | Mínimo |
| 3 | Hero/cover con tratamiento mínimo (cada uno en su propio lenguaje) | Bodas, Formal, Infantil | Bajo |
| 4 | Muro: un detalle de objeto propio (no copiar tablón ni marco) | Bodas, Formal, Infantil | Medio |
| 5 | Confirmaciones/badges: decidir caso por caso si amerita forma propia o basta el pill ya coloreado | Bodas, Formal, Infantil | Medio |
| 6 | Mapa: tratamiento de `iframe` para los 5 temas que hoy no lo tienen (incluida Graduación) | Vaquera ya resuelto; resto + Graduación | Bajo |
| — | Jerarquía tipográfica h1/cuerpo (weight, no fuente nueva) | Infantil | Mínimo |

Default queda fuera de todas las oleadas — es el control group.

**Qué NO tocar bajo ningún escenario**:
- Los módulos del QR (contraste/escaneabilidad no es negociable por
  estética).
- El fondo de Formal (su minimalismo es la identidad, no un gap).
- La estructura de bloques de la invitación (fija para los 6 temas, por
  contrato).
- `InvitationCard.tsx`, `InvitationThemeRoot.tsx`, `ThemeOrnament.tsx`,
  `InviteDivider.tsx`, `WallSection.tsx`, `ThemeSeal.tsx` — todo entra
  por `registry.ts` + CSS scoped, igual que hasta ahora.
