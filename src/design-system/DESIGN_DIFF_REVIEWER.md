# PaseLink — Design System Diff Reviewer (OBLIGATORIO)

Cada vez que se vaya a modificar `src/styles/templates.css`, este proceso
debe ejecutarse primero, en el rol de revisor de cambios de diseño
(design diff reviewer) — nunca como implementador directo. Ningún cambio
se aplica hasta completar esta revisión.

Este documento opera la "Regla de evolución" del
[`DESIGN_GOVERNANCE.md`](./DESIGN_GOVERNANCE.md) — esa regla dice *qué*
preguntar; este documento define *cómo* responderlas y con qué
veredictos.

## Contexto que asume este reviewer

- 5 temas visuales (Vaquera, Graduación, Bodas, Formal, Infantil).
- Un Design Stability Contract activo (`templates.css`, bloque superior).
- Un Design Governance Layer activo (`DESIGN_GOVERNANCE.md`).
- Reglas estrictas de superficies, materialidad y alcance.

El trabajo de este rol **no es implementar**. Es decidir si el cambio
propuesto es válido o no, antes de que se escriba una sola línea.

## Input

Se recibe un diff o una descripción del cambio propuesto en
`templates.css`. Se analiza ese input completo antes de cualquier
implementación.

## Proceso de revisión (obligatorio)

### 1. Clasificación del cambio

Clasificar en una de estas categorías:

- **Identity-only** (permitido)
- **Structural** (prohibido)
- **Cross-theme contamination** (prohibido)
- **Density adjustment** (requiere validación)
- **Unknown impact** (prohibido hasta clarificación)

### 2. Validación de contrato de superficies

Cada tema debe mantener exactamente: Fondo, Tipografía `h1`, Card
principal, Divisor/ornamento, Muro, Botón primario.

Verificar: ¿alguna superficie fue eliminada? ¿se agregó una nueva
superficie? ¿se alteró la existencia de una superficie?

Cualquier desviación = **RECHAZAR**.

### 3. Validación de materialidad

Verificar: ¿el cambio introduce o mezcla materiales de otro tema? (foil,
guilloché, papel, confeti, cuero, minimal metálico, etc.)

Si hay mezcla o préstamo cruzado = **RECHAZAR**.

### 4. Validación de alcance

El cambio solo puede afectar: Invitation UI, Wall/messages,
Buttons/actions, Preview de invitación.

Si afecta dashboard, reports, auth o backend = **RECHAZAR**.

### 5. Validación estructural

Verificar: orden de bloques de UI, existencia de componentes,
dependencia de `InvitationCard` / `ThemeOrnament` / `ThemeSeal`.

Si hay cambio estructural = **RECHAZAR**.

### 6. Evaluación de densidad

Evaluar: ¿el cambio mantiene coherencia con el resto del sistema?
¿incrementa o reduce densidad sin justificación?

Si rompe el equilibrio global = **REQUIERE REVISIÓN HUMANA**.

## Decisión final (obligatoria)

Toda revisión termina siempre en uno de estos tres veredictos:

- **APPROVED** — el cambio cumple todos los criterios del sistema.
- **APPROVED WITH RISKS** — el cambio es válido, pero introduce riesgo de
  deriva o necesita revisión futura.
- **REJECTED** — el cambio rompe al menos una regla del sistema:
  estructura, superficies, materialidad, alcance o consistencia entre
  temas.

## Regla crítica

"Se ve bien" no es una justificación válida. Solo se admiten criterios
del Design Governance Layer (estructura, superficies, materialidad,
alcance, densidad).

## Objetivo del sistema

Este reviewer existe para garantizar estabilidad entre temas, coherencia
estructural del sistema, prevención de deriva visual y control de
complejidad en CSS.
