# Guía de estilo de español neutro — PaseLink

PaseLink se usa en toda Latinoamérica. Ningún texto de la aplicación debe sonar
"de un país" en particular. Esta guía es la referencia oficial y **permanente**
para todo texto visible que se escriba en el proyecto de aquí en adelante:
UI, formularios, validaciones, toasts, confirmaciones, emails, notificaciones,
mensajes de Cloud Functions, y contenido estático (landing, legales, etc.).

## 1. Auditoría (2026-07-31)

Se revisó todo `src/` y `functions/src/` en busca de regionalismos de España,
Argentina/Uruguay, Chile y México.

**Resultado:** no se encontraron regionalismos de España, Chile ni México
(vosotros, pulsa, ordenador, al tiro, computador, pololo, órale, chido, wey,
etc.). El problema real era **voseo argentino** (vos/tenés/podés/hacé),
concentrado casi por completo en tres features construidas en sesiones
recientes: lista de espera, reconfirmación de asistencia y concesiones
(comida/bebida). Ejemplos representativos de lo corregido:

| Antes (voseo) | Después (neutro) | Dónde |
|---|---|---|
| "¿Seguro que **querés** cancelar este pedido?" | "¿Seguro que **quieres** cancelar este pedido?" | Concesiones, cancelar pedido |
| "**Podés** cerrar esta página y volver cuando quieras" | "**Puedes** cerrar esta página y volver cuando quieras" | Estado de lista de espera |
| "No **tenés** permiso para gestionar este evento." | "No **tienes** permiso para gestionar este evento." | Cloud Functions (errores) |
| "¡Se liberó un lugar para **vos**!" | "¡Se liberó un lugar para **ti**!" | Email + pantalla de oferta |
| "**Confirmá** tu asistencia a {evento}" | "**Confirma** tu asistencia a {evento}" | Asunto de email de reconfirmación |
| "**Activalo** solo para este evento" | "**Actívalo** solo para este evento" | Configuración de menú |
| "vos **decidís** si liberar su lugar" | "tú **decides** si liberar su lugar" | Modal de reconfirmación |
| "Ingresá / Elegí / Guardá / Recargá…" | "Ingresa / Elige / Guarda / Recarga…" | Validaciones de formularios (~15 archivos) |

En total se corrigieron más de 50 strings en ~35 archivos (componentes,
páginas, hooks y Cloud Functions), incluyendo comentarios de código que citaban
el copy viejo entre comillas.

Aparte del voseo, se encontró y corrigió una inconsistencia terminológica real:
el botón de eliminar invitados en bloque decía **"Borrar"** mientras que el
resto de la app usa **"Eliminar"** para la misma acción (y el modal de borrar
un mensaje del muro tenía el título en "Eliminar" pero el cuerpo en "Borrar").
Se unificó todo a "Eliminar" (ver glosario).

El resto de la terminología ya estaba razonablemente unificada (Agregar,
Quitar, Eliminar, Confirmar, Compartir, etc. se usan de forma consistente para
la misma acción en toda la app) — no hizo falta un rediseño de vocabulario,
solo esta limpieza puntual.

## 2. Reglas de escritura

- **Tratamiento: siempre tú.** Nunca "vos" (voseo) ni "vosotros" (España).
  "Usted" solo para textos legales muy formales (Términos, Privacidad) si ya
  están en ese registro — no para el resto de la app.
- Imperativo en tú: *agrega, elige, guarda, confirma, revisa* — nunca la forma
  voseo (*agregá, elegí, guardá, confirmá, revisá*) ni la forma usted
  (*agregue, elija, guarde, confirme, revise*).
- Mensajes cortos, directos, sin tecnicismos innecesarios.
- Tono: profesional, moderno, cercano, claro. Ni informal/relajado (jerga,
  diminutivos), ni corporativo/frío, ni robótico.
- Evitar regionalismos de cualquier país (España, Argentina, Chile, México,
  etc.) salvo que exista una razón funcional clara (p. ej. un modismo dentro
  de contenido generado por el propio usuario/organizador, que no se toca).
- Si ya existe un término oficial para una acción (ver glosario), no introducir
  sinónimos nuevos.

## 3. Glosario oficial

Usar siempre estos términos. No introducir variantes.

| Concepto | Término oficial | Notas |
|---|---|---|
| Agregar algo nuevo | **Agregar** | No "Añadir", "Crear", "Nuevo X", "Registrar X" |
| Quitar un rol/ítem de una lista editable (reversible, no destruye datos) | **Quitar** | Ej: quitar una pregunta del FAQ, quitar a alguien como co-organizador, quitar de favoritos. Distinto de "Eliminar" |
| Borrar un registro permanentemente | **Eliminar** | Invitado, mensaje del muro, plantilla, cuenta. No "Borrar" (salvo que el propio componente ya use "Borrar" de forma consistente para *ese mismo* flujo destructivo específico — evitar mezclar los dos términos en un mismo flujo) |
| Persistir cambios de un formulario | **Guardar** / **Guardar cambios** | "Guardar cambios" en formularios largos de edición, "Guardar" en formularios cortos/modales |
| Volver a cargar datos en pantalla | **Actualizar** | No confundir con "Guardar" |
| Cancelar una acción o cerrar sin guardar | **Cancelar** | |
| Persona invitada a un evento | **Invitado** | |
| Persona que crea/administra el evento | **Organizador** | "Coanfitrión" para quien lo administra sin ser el dueño |
| El evento en sí | **Evento** | |
| Código de acceso escaneable | **Código QR** | |
| Marcar que se va a asistir | **Confirmar asistencia** | |
| Cola para cuando el evento está lleno | **Lista de espera** | |
| Recordatorio para confirmar antes de una fecha límite | **Reconfirmación** / **Reconfirmar asistencia** | |
| Pago sin verificar todavía | **Pago pendiente** | |
| Pago ya verificado por el organizador | **Pago confirmado** | |
| Leer un código QR con la cámara | **Escanear QR** | |
| Enviar a otra persona/app | **Compartir** | |
| Modificar datos existentes | **Editar** | |
| Ajustes del evento/cuenta | **Configuración** | |
| Sección de comida y bebida | **Menú** (organizador) / **Concesiones** (nombre interno del módulo) | El invitado siempre ve "Menú", nunca "Concesiones" |

## 4. Regla permanente

A partir de esta auditoría, **todo texto nuevo** que se agregue al proyecto
(pantallas, componentes, mensajes, errores, emails, notificaciones) debe:

1. Usar tú, nunca vos/vosotros/usted (salvo legal).
2. Respetar el glosario de la sección 3.
3. Evitar cualquier regionalismo específico de un país.

Si en algún momento se detecta que un cambio nuevo rompe esta guía, se corrige
antes de dar el trabajo por terminado.

## 5. Confirmación

Al cierre de esta auditoría (2026-07-31), `src/` y `functions/src/` no
contienen voseo, vosotros, ni regionalismos detectables de España, Argentina,
Chile o México en texto visible para el usuario. `npx tsc --noEmit` pasa sin
errores en frontend y en `functions/` tras los cambios.
