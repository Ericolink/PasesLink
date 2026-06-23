# Plan de paridad visual — Bodas, Formal, Infantil (v1.24.3)

Segunda pasada de diseño, apoyada en [`TEMPLATE_AUDIT.md`](./TEMPLATE_AUDIT.md).
Alcance explícito: **Bodas, Formal e Infantil únicamente.** Vaquera y
Graduación no se tocan en esta ronda — son la referencia, no el objetivo.
Documento de estrategia, no implementa nada. Todo cambio que se derive de
acá pasa primero por [`DESIGN_DIFF_REVIEWER.md`](./DESIGN_DIFF_REVIEWER.md)
y debe seguir cumpliendo [`DESIGN_GOVERNANCE.md`](./DESIGN_GOVERNANCE.md).

Antes de proponer nada, una verificación que no estaba en la primera
auditoría: **el volumen de CSS por tema ya es desigual hoy**, contando
líneas reales de `templates.css`:

| Tema | Líneas de CSS propio | Relación con Vaquera |
|---|---|---|
| Vaquera | ~392 | 1x (referencia alta) |
| Graduación | ~259 | 0.66x |
| Bodas | ~109 | 0.28x |
| Formal | ~59 | 0.15x |
| Infantil | ~58 | 0.15x |

El contrato de `DESIGN_GOVERNANCE.md` pide que ningún tema se aleje más
de ~2x del resto del grupo. Hoy Vaquera ya está ~6.7x por encima de
Infantil — el sistema **ya** viola su propia regla de densidad, pero en
el sentido "de más" en Vaquera, no "de menos" en el resto. Esto cambia el
encuadre de esta ronda: no se trata de igualar a Vaquera, se trata de
subir el piso de los tres temas restantes hasta una banda razonable
(~150–260 líneas cada uno) que los acerque a Graduación sin pretender
alcanzar a Vaquera, que es probablemente el outlier a no usar como vara.

---

## 1. Auditoría actualizada por tema

### Bodas

**Ya funciona bien**: tipografía (Playfair Display itálica + Cormorant
Garamond, [templates.css:519](../styles/templates.css#L519)) y fondo
(grano de papel + manchas doradas irregulares,
[templates.css:510](../styles/templates.css#L510)). Estas dos superficies
están al nivel de Vaquera/Graduación sin necesitar ningún cambio.

**Sigue sintiéndose genérico**: divisor (la línea bajo el ornamento
floral nunca se sobreescribe — sigue siendo el hairline gris de
`default`), muro (solo hereda color y radio, cero textura/objeto propio),
confirmaciones/badges (pill coloreado, sin forma), dashboard (0%, no
envuelto en `InvitationThemeRoot`).

**Qué rompe la inmersión**: dos momentos concretos, no abstractos.
(1) El ornamento floral —la pieza más delicada del tema— está pegado a
una línea recta gris sin relación con la paleta dorada: es la transición
visual más visible de la invitación (aparece entre cada bloque) y hoy
contradice el cuidado puesto en tipografía/fondo. (2) Si el anfitrión
sube foto de portada, esa foto cae en `.invite-cover` sin ningún filtro
ni viñeta — una foto de teléfono cualquiera, sin tratamiento, justo
debajo de un h1 editorial cuidadosamente compuesto. Es el choque de
registro más fuerte de las tres plantillas auditadas.

**Exclusivo de Bodas, no replicar**: grano de papel algodón + manchas
doradas irregulares (textura de fondo). Si Formal o Infantil necesitan
fondo, debe ser otro mecanismo, nunca grano de papel.

### Formal

**Ya funciona bien**: tipografía (Cormorant Garamond h1 + Space
Grotesk cuerpo, tracking amplio) y divisor (único de los tres con doble
filete propio en dos tonos del metal,
[templates.css:892](../styles/templates.css#L892)) — ya resuelto, no
necesita trabajo. El fondo minimalista (dos gradientes lineales sutiles)
es intencional, no un gap: es la única plantilla del sistema donde "casi
no hacer nada" es la decisión de diseño correcta.

**Sigue sintiéndose genérico**: hero/cover (sin tratamiento), muro (solo
un filete superior de 2px, sin ningún otro detalle), confirmaciones/
badges, dashboard (0%).

**Qué rompe la inmersión**: el doble filete es literalmente la firma
visual completa del tema —aparece en la tarjeta y en el divisor— pero el
cover queda totalmente fuera de ese lenguaje. Cuando hay foto, es el
único elemento de toda la tarjeta que no lleva el filete, y por eso se
lee como "una foto pegada encima", no como parte de la misma papelería.
Es el mismo problema que Bodas pero con causa distinta: en Bodas falta
ornamentación; en Formal falta aplicar un recurso que ya existe y que el
tema usa en todos lados excepto ahí.

**Exclusivo de Formal, no replicar**: doble filete metálico frío
(gunmetal/platino) + tracking amplio en mayúsculas/versalitas. Ninguna
otra plantilla puede usar "doble filete" como recurso — es la firma de
Formal tal como el grano de papel es la de Bodas.

### Infantil

**Ya funciona bien**: fondo (confeti en 3 capas irregulares,
[templates.css:931](../styles/templates.css#L931)) y botón (bounce sutil
`scale(1.04)/scale(.97)`,
[templates.css:966](../styles/templates.css#L966)) — ambos transmiten
"fiesta cuidada" sin caer en infantil-genérico.

**Sigue sintiéndose genérico**: tipografía (el h1 solo cambia
`font-weight`/`letter-spacing`, sigue siendo la misma Baloo 2 que el
cuerpo — es el único tema no-default sin separación display/body),
divisor (mismo gap exacto que Bodas: ornamento de confeti sobre línea
gris genérica), muro (solo filete superior, sin motivo de fiesta), 
confirmaciones/badges, dashboard (0%).

**Qué rompe la inmersión**: el título del evento —lo primero que lee
cualquiera— no se distingue tipográficamente del resto del texto más que
por tamaño. En un sistema donde los otros cuatro temas no-default *todos*
separan título de cuerpo (Rye/Old Standard TT, Playfair/Cormorant,
Cinzel/EB Garamond, Cormorant/Space Grotesk), Infantil es el único que no
lo hace — y es justo el tema donde un título "sin personalidad" más se
nota, porque el resto del tema (fondo, botón) sí la tiene.

**Exclusivo de Infantil, no replicar**: confeti monocromático en tres
intensidades del mismo matiz (nunca multicolor). Ningún otro tema puede
usar puntos/confeti como motivo de fondo.

---

## 2. Priorización — orden de la "pasada profunda"

Criterio explícito, no de gusto: **impacto visual** (qué tan seguido se
ve y qué tan grande es el quiebre de inmersión) × **esfuerzo técnico**
(líneas de CSS estimadas, reutilización de mecanismos ya probados) ÷
**riesgo de regresión** (qué tan acoplado está el cambio a superficies
ya estables) = retorno visual por línea de código.

| Tema | Impacto visual | Esfuerzo estimado | Riesgo | ROI/LOC |
|---|---|---|---|---|
| **Bodas** | Alto — el choque hero/divisor es el más visible de los tres; categoría (bodas) con mayor expectativa de cuidado editorial | Medio (~110–130 líneas nuevas: divisor 5, hero 20, muro 25, dashboard ~70, mapa 5) | Bajo — cada pieza reutiliza un mecanismo ya probado en otro tema (filete de Formal, viñeta de Vaquera *como mecanismo*, dashboard de Graduación *como patrón*) | Alto |
| **Formal** | Medio-alto — menos superficies rotas, pero el hero sin filete es muy notorio porque el resto de la tarjeta sí lo tiene | Bajo (~85–95 líneas: hero 10, muro 15, dashboard ~60, mapa 5) — el minimalismo hace que cada fix sea más barato que en Bodas | Bajo — mismo argumento que Bodas, y la identidad "menos es más" tolera mejor un ajuste incompleto sin verse roto | Muy alto |
| **Infantil** | Medio — el gap tipográfico es muy visible pero acotado a una superficie; el resto del gap (muro, dashboard) es comparable a los otros dos | Bajo-medio (~90–95 líneas: tipografía 2, divisor 5, muro 20, dashboard ~60, mapa 5) | Medio — es el único de los tres con riesgo de juicio creativo ("sobrecargar de fiesta"), no de regresión técnica | Alto, con la salvedad del riesgo de criterio |

**Recomendación: Bodas primero, Formal segundo, Infantil tercero.**

- **Bodas primero** porque es donde el ROI absoluto es mayor: dos
  superficies ya de referencia conviven con las más rotas del grupo (la
  brecha interna del tema es la más grande de las tres), y categoría
  bodas es la de mayor sensibilidad a verse "a medio terminar" para
  quien paga por ella.
- **Formal segundo**, no primero, a pesar de tener el mejor ROI/LOC,
  porque conviene que el patrón de extensión de dashboard (la pieza más
  grande y más nueva de esta ronda) se valide una vez en Bodas antes de
  replicarlo — Formal se beneficia de heredar ese patrón ya revisado,
  bajando aún más su costo real.
- **Infantil tercero** porque su arreglo de mayor impacto (tipografía)
  es tan barato que no depende de ir primero ni último, y porque es el
  único de los tres donde un exceso de entusiasmo en el resto de
  superficies (muro, dashboard) puede inclinar el tema hacia "saturado"
  — conviene calibrarlo después de tener dos rondas de referencia recién
  hechas (Bodas, Formal) para juzgar "cuánto es suficiente" con datos
  frescos, no en abstracto.

---

## 3. Plan por fases

A diferencia de las oleadas de `TEMPLATE_AUDIT.md` (organizadas por
superficie, cruzando los tres temas a la vez), esta versión separa
explícitamente lo **mecánico y compartido** (cero ambigüedad de diseño,
se puede hacer de una sola pasada para los tres temas) de lo
**creativo y secuencial** (requiere juicio por tema, una pasada profunda
a la vez, en el orden de la sección 2).

### Fase 0 — Arreglos mecánicos compartidos (Bodas + Formal + Infantil)

- **Superficies que toca**: Divisor (Bodas, Infantil), Mapa (los tres),
  Tipografía (solo Infantil).
- **Archivos**: únicamente `src/styles/templates.css`. Cero componentes
  React.
- **Patrones que reutiliza**: el filete del divisor de Formal
  (`border-top-color` + `box-shadow` de una línea,
  [templates.css:892](../styles/templates.css#L892)) se clona para
  Bodas/Infantil con su propio acento. El filtro de `iframe` de Vaquera
  (`filter: sepia(...)`, [templates.css:147](../styles/templates.css#L147))
  se clona como *mecanismo*, no como valor — cada tema necesita su propio
  tono de filtro para no converger con el cuero de Vaquera (ver sección
  5). La tipografía de Infantil sube `font-weight` del h1 a 700 — peso ya
  cargado en `index.html` (`Baloo+2:wght@500;600;700`), cero fuente
  nueva, cero request adicional.
- **Riesgos**: prácticamente ninguno. Son selectores aislados, sin
  interacción con JS, sin tocar superficies que ya funcionan.
- **Por qué va primero pese a no ser "el tema prioritario"**: es la
  fase de mayor retorno por esfuerzo de todo el plan (líneas de código
  de un dígito por fix) y no compite con el orden de la sección 2 — son
  arreglos independientes que pueden entrar en un solo PR de revisión
  rápida antes de empezar el trabajo más largo en Bodas.

### Fase 1 — Pasada profunda: Bodas

- **Superficies que toca**: Hero/portada, Muro (objeto propio),
  Dashboard del organizador.
- **Archivos**: `src/styles/templates.css` únicamente. El hero usa el
  `:not(:empty)` que ya existe en `.invite-cover`
  ([templates.css:83](../styles/templates.css#L83)) — no requiere tocar
  `InvitationCard.tsx`.
- **Patrones que reutiliza**: viñeta del cover de Vaquera
  ([templates.css:166](../styles/templates.css#L166)) como *mecanismo*
  (radial-gradient de esquinas), nunca como valor — en Bodas debe ser un
  velo cálido casi imperceptible, no un viraje de color tipo cuero. Para
  el dashboard, el bloque completo de selectors de Graduación
  ([templates.css:770](../styles/templates.css#L770) a
  [templates.css:858](../styles/templates.css#L858)) se clona 1:1 en su
  estructura (mismo set: `.bg-white`, `.bg-gray-50/100`, `.border-gray-*`,
  `.text-gray-*`, `.text-primary`, `.bg-primary`, `.invite-stat-card`),
  cambiando solo los valores de color a los tokens de Bodas.
- **Riesgos**: el dashboard es la pieza de mayor superficie de selectores
  de esta fase — el riesgo no es visual, es de especificidad CSS (ganarle
  a las utilidades de Tailwind sin `@layer`, mismo mecanismo ya probado
  dos veces). Mitigación: copiar la estructura exacta ya validada, no
  reinventar selectores nuevos.
- **Qué NO incluye esta fase**: badges/confirmaciones con forma propia
  (sello o credencial) — se evalúa después de ver el resultado de hero +
  muro + dashboard, no se da por garantizado.

### Fase 2 — Pasada profunda: Formal

- **Superficies que toca**: Hero/portada, Muro, Dashboard.
- **Archivos**: igual que Fase 1, solo `templates.css`.
- **Patrones que reutiliza**: el doble filete ya existe como mecanismo
  (`--invite-shadow` en `registry.ts`,
  [registry.ts:169](../templates/registry.ts#L169)) — el hero solo
  necesita aplicar ese mismo filete al `.invite-cover` cuando tiene foto,
  sin inventar nada nuevo. El muro recibe una variante mínima del mismo
  filete (no un objeto nuevo — Formal no necesita "un objeto", necesita
  que el filete llegue a todos lados). El dashboard reutiliza la
  estructura ya clonada en Fase 1, ahora con un segundo precedente que
  reduce el riesgo de specificity a casi cero.
- **Riesgos**: los más bajos del plan — Formal es minimalista, así que
  "quedó incompleto" es menos visible que en un tema más denso.
- **Qué NO incluye esta fase**: cualquier textura (grano, confeti,
  cuero) — el minimalismo de Formal se mantiene aunque eso signifique que
  esta fase "se vea" menos espectacular que las otras dos. Es correcto
  que así sea.

### Fase 3 — Pasada profunda: Infantil

- **Superficies que toca**: Muro (motivo de esquina), Dashboard. (La
  tipografía y el divisor ya se resolvieron en Fase 0).
- **Archivos**: `templates.css` únicamente.
- **Patrones que reutiliza**: el motivo de esquina del muro de Vaquera
  (`mask-image` con SVG de datos,
  [templates.css:195](../styles/templates.css#L195)) como *mecanismo*
  — en Infantil el SVG de máscara sería el mismo punto de confeti que ya
  existe en `KidsOrnament` ([ornaments.tsx:53](../templates/ornaments.tsx#L53)),
  nunca el cactus/herradura de Vaquera. Dashboard, mismo patrón clonado
  dos veces ya.
- **Riesgos**: el único de los tres con riesgo de criterio, no técnico
  — ver sección 5 para el límite explícito de "cuánto confeti es
  demasiado".
- **Qué NO incluye esta fase**: cualquier intento de "festejar" las
  confirmaciones con un badge/sello propio — alto riesgo de inventar un
  objeto poco creíble (un "sello de fiesta" no tiene un referente físico
  tan claro como el sello de diploma de Graduación o la credencial de
  sheriff de Vaquera). Mejor dejarlo en el pill ya coloreado que forzar
  un objeto nuevo.

### Fase 4 (opcional, evaluar después de 1–3) — Confirmaciones/badges

Solo se ejecuta si, después de ver Bodas/Formal/Infantil con hero+muro+
dashboard resueltos, el pill genérico sigue sintiéndose como el cabo
suelto más visible. No es parte del compromiso de esta ronda — se decide
con los tres temas ya en mano, no antes.

---

## 4. Dashboard del organizador — ¿vale la pena extenderlo?

**Sí, se recomienda extenderlo a Bodas, Formal e Infantil.** Razón
central: hoy es la única superficie de las 12 donde la brecha no es de
"identidad débil" sino de "identidad ausente por construcción" — un `if`
de código, no CSS sin terminar. Cualquier otra superficie de estos tres
temas, en el peor caso, se ve recoloreada; el dashboard se ve **como si
el tema no existiera**, lo cual es la queja exacta que motiva esta
ronda completa.

**Nivel de tematización recomendado — exactamente el mismo patrón
proporcional que ya usan Vaquera/Graduación, sin ampliarlo**:

- Fondo de página (`InvitationThemeRoot` envolviendo `EventDetail`,
  `Reports`, `EventWall`, mismo `if` explícito que hoy filtra por
  `cowboy`/`graduation`, ahora sumando los tres temas).
- Botones primarios (`bg-primary`) y enlaces (`text-primary`).
- Texto (`text-gray-900/700/600/500/400/300` → tokens `--invite-text` /
  `--invite-text-muted`).
- Stat cards (`.invite-stat-card`) — filete superior en el acento,
  igual que Vaquera/Graduación.
- Botones secundarios sin relleno (`border-gray-300`/`border-gray-600`
  que no son inputs) — pasan a placa con borde en el acento, mismo
  criterio ya escrito en el comentario de
  [templates.css:402](../styles/templates.css#L402).
- El repintado de `bg-white`/`border-gray-*`/`bg-gray-50/100` con
  `!important` **solo se activa en modo oscuro** (`.dark [data-template='x']`),
  igual que hoy — en modo claro esas tarjetas blancas quedan como están.

**Qué NO debería tematizarse, para no sobrecargar el dashboard**:

- No repintar cada `bg-white` de tarjeta en modo claro — ya quedó
  demostrado con Vaquera/Graduación que alcanza con página + botones +
  texto + stat-card; ir más allá no aporta y multiplica superficie de
  regresión.
- No tocar `GuestList.tsx`, `EventAnalytics.tsx`, `GuestAddForm.tsx`,
  `EditEventForm.tsx`, `ConfirmDialog.tsx`, `PlanBadge.tsx` directamente
  — siguen sin saber que existe un tema, exactamente como hoy. Toda la
  extensión entra por `templates.css`.
- No agregar ornamentación nueva al dashboard (sin grano de papel en
  Bodas, sin confeti en Infantil, sin filete doble en Formal *dentro* del
  dashboard) — el dashboard recibe paleta y forma de botón/stat-card,
  nunca la materialidad decorativa completa de la invitación. Es
  trabajo, no celebración: la regla ya implícita en cómo Vaquera/
  Graduación lo resolvieron (textura de "ficha"/"transcripción", nunca el
  tablón de anuncios completo ni el marco institucional completo).
- No cambiar la animación de entrada del dashboard (`animate-fade-in`)
  para estos tres temas — el comentario de
  [EventDetail.tsx:535](../pages/EventDetail.tsx#L535) ya fija esto
  deliberadamente incluso para Vaquera/Graduación.
- Colores semánticos (rojo error, verde éxito, ámbar advertencia) no se
  tocan — mismo criterio ya aplicado en los dos temas existentes.

---

## 5. Qué NO hacer

**Descartado por esta ronda** (no por mal, sino por no ser parte del
objetivo "cerrar brechas existentes sin sumar decoración"):
- Sello o credencial propia para Bodas/Formal/Infantil (Fase 4, sección 3
  — condicional, no comprometida).
- Cualquier rediseño de `TemplatePicker.tsx` o de la lógica de selección
  de tema — fuera de alcance, no es una superficie de la invitación.
- Tocar Vaquera o Graduación de cualquier forma, incluso si "de paso"
  se nota una mejora posible (p. ej. el mapa de Graduación) — eso quedó
  identificado en `TEMPLATE_AUDIT.md` y se evalúa en una ronda futura
  separada, no en esta.

**Recursos que invadirían territorio de otro tema (prohibido por
materialidad exclusiva)**:
- Grano de papel fuera de Bodas.
- Confeti fuera de Infantil.
- Doble filete fuera de Formal.
- Foil dorado, guilloché o marco institucional fuera de Graduación —
  esto aplica en particular a Bodas (que ya usa dorado como acento de
  color): el dorado de Bodas es cálido/foil de joyería, nunca debe ganar
  un marco ni un sello redondo, porque eso es vocabulario de Graduación,
  no de paleta.
- Sepia/cuero fuera de Vaquera — el filtro de mapa de Bodas/Formal/
  Infantil debe ser un tono propio (cálido sutil en Bodas, frío/gris en
  Formal, saturado en Infantil), nunca el mismo sepia de Vaquera con
  otro color de fondo.

**Lo que aumentaría densidad visual sin necesidad**:
- Más de un objeto decorativo nuevo por tema en esta ronda (cada tema
  recibe como máximo: un tratamiento de hero, un detalle de muro, el
  dashboard — no se suman ítems "ya que estamos").
- Cualquier intento de igualar a Vaquera en volumen de CSS — como se
  vio en la tabla de la introducción, Vaquera ya es el outlier alto del
  sistema. El objetivo es 150–260 líneas por tema al cierre de esta
  ronda, no 390.
- Animaciones nuevas en el dashboard — las únicas animaciones que
  ya existen ahí (fade-in) se mantienen sin cambios para los tres temas.

**Cualquier cambio que violaría `DESIGN_GOVERNANCE.md` directamente**:
- Agregar una 7ª superficie a cualquiera de los tres temas sin
  preguntarse si Vaquera/Graduación/Formal/Bodas/Infantil la necesitan
  también (regla explícita del documento).
- Reordenar, esconder o duplicar cualquier bloque de la secuencia
  Título → Ornamento → Detalles → Invitado → QR → Acciones → Mensajes →
  Muro — ninguna fase de este plan lo requiere, y si en la implementación
  apareciera la tentación de hacerlo, es señal de que el cambio se
  reclasificó de "identidad" a "estructura" y debe rechazarse.
- Tocar `InvitationCard.tsx`, `InvitationThemeRoot.tsx`,
  `ThemeOrnament.tsx`, `InviteDivider.tsx`, `WallSection.tsx` o
  `ThemeSeal.tsx` — ninguna fase de este plan lo necesita; todo entra por
  `templates.css` con selectores `[data-template='x']`, igual que el
  100% de lo que ya existe.

---

## 6. Resumen ejecutivo

**Próxima plantilla con pasada profunda: Bodas.** Razón: mayor brecha
interna (dos superficies de referencia conviviendo con las más débiles
del sistema), mayor sensibilidad de categoría, y costo medio-bajo porque
cada pieza faltante reutiliza un mecanismo ya probado en otro tema.

**Orden completo de esta ronda**: Fase 0 (arreglos mecánicos compartidos,
Bodas+Formal+Infantil) → Fase 1 (Bodas: hero, muro, dashboard) → Fase 2
(Formal: mismas tres superficies, más barato por heredar el patrón) →
Fase 3 (Infantil: muro + dashboard, ya con tipografía/divisor resueltos
desde la Fase 0) → Fase 4 opcional (badges/confirmaciones, a decidir con
los tres temas ya en mano).

Vaquera y Graduación quedan fuera de esta ronda — su propia brecha
(mapa, principalmente) se evalúa por separado, después de cerrar esta.
