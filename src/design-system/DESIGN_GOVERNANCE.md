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
