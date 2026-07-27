# Auditoría de Accesibilidad — PaseLink

**Fecha:** 2026-07-25
**Alcance:** Toda la SPA (React 19 + React Router 7 + TypeScript + Tailwind CSS + Firebase), landing, auth, dashboard, creación de eventos, gestión de invitados, check-in/escáner QR, invitaciones digitales, plantillas, CRM, reportes, panel administrativo, formularios, modales, tabs, tablas, gráficas.
**Estándar de referencia:** WCAG 2.2 nivel AA, ARIA Authoring Practices Guide (APG), HTML semántico.
**Método:** revisión manual de código fuente (no escaneo automatizado en navegador). Contraste de color calculado matemáticamente (fórmula de luminancia relativa WCAG) a partir de los tokens de color reales en `src/templates/registry.ts` e `index.css`. No se ejecutó ningún flujo de escritura contra Firebase de producción.

> Nota metodológica: esta auditoría es de código estático. No reemplaza pruebas con lectores de pantalla reales (NVDA/JAWS/VoiceOver/TalkBack) ni pruebas de usuario. La sección 15 traduce los hallazgos a los síntomas esperables con esas herramientas.

---

## 1. Resumen ejecutivo

PaseLink tiene una base técnica sólida en varias áreas —namespacing semántico razonable en el layout raíz, un hook `useModalA11y` centralizado que ya resuelve foco/Escape/scroll-lock para la mayoría de modales, soporte CSS extenso para `prefers-reduced-motion`, y patrones limpios en formularios de autenticación (Login/Register/ForgotPassword)—, pero presenta **brechas sistémicas** que impiden cumplir WCAG 2.2 AA de forma consistente:

1. **No existe casi ningún mecanismo de anuncio a lectores de pantalla.** Solo hay una región `aria-live`/`role="status"` en toda la aplicación (`CrownLoader.tsx`). Toasts, errores de formulario, resultados de escaneo, cambios de página de tablas, conteos de filtros y confirmaciones de acciones administrativas son invisibles para usuarios de lector de pantalla.
2. **Varios formularios centrales (auto-edición de invitado, alta de invitado, pago) usan `<label>` sin `htmlFor`/`id` o solo `placeholder`**, lo que rompe el requisito más básico de un formulario accesible.
3. **Puntos de interacción críticos dependen de `<div>`/`<tr onClick>` sin equivalente de teclado**: la fila de invitado completa (`GuestRow`), la tarjeta de feedback en móvil, y filas de tablas de administración.
4. **Dos plantillas de invitación (Boda y Kids) fallan contraste de texto de forma medible** (hasta 2.29:1 contra el mínimo de 4.5:1) en pantallas que ve el invitado final, no solo el organizador.
5. **El manejo de foco tiene fugas puntuales pero reales**: un elemento `disabled` rompe el trap de foco en `ReportModal`, cambios internos de paso en `GuestSignupPrompt`/`GuestDetailSheet` sueltan el foco a `<body>`, y `PhotoViewer` no implementa ningún patrón de diálogo accesible.
6. **No hay skip link** y la navegación por rutas de React Router no mueve el foco ni anuncia el cambio de página.

Ninguno de estos problemas es específico de un componente aislado — son patrones que se repiten en decenas de archivos, lo cual es una buena noticia operativa: **arreglar un puñado de componentes compartidos** (`Toast`, `FieldError`/`TextField`, `useModalA11y`, `Icons.tsx`, `GuestRow`) resuelve la mayoría de las instancias de una sola vez.

### Aspectos ya bien resueltos (verificado, no requieren acción)
- `index.html` con `lang="es"` correcto y viewport sin bloqueo de zoom (`user-scalable`/`maximum-scale` no restringidos → cumple 1.4.4/1.4.10).
- `useModalA11y.ts` ya corrigió (commit `97abea8`, 2026-07-20) el bug histórico de pérdida de foco por identidad de `onClose` cambiante.
- `BottomTabBar` usa `<nav>` real, `<Link>` reales y `aria-current="page"` correctamente.
- 8 bloques `@media (prefers-reduced-motion: reduce)` en `index.css` cubren la mayoría de animaciones CSS (orbe de fondo, skeletons, countdown, acordeón de menú, hover de tickets, etc.).
- El bug histórico de escala de grises invertida en `.dark` (`dark:text-gray-50/100/200`) ya no aparece en ningún `.tsx` — 0 coincidencias confirmadas.
- 5 de las 7 plantillas de invitación (default, cowboy, graduation, formal, houseparty) pasan contraste AA sin problema (≥4.29:1, mayoría 5–17:1).
- `PasswordInput`, `LegalConsentCheckbox`, `CoverImagePicker`, `EventScheduleField`, `TimelineEditor`, y los formularios de Login/Register/ForgotPassword/ResetPassword/CompleteProfile tienen labels, `autoComplete` y asociación `htmlFor`/`id` correctos.
- Ningún link roto genérico ("click aquí", "ver más", `href="#"` estático) — todo el texto de enlace muestreado es descriptivo.
- Sin mecanismos de timeout de sesión por inactividad que puedan expulsar al usuario sin aviso (2.2.1 no aplica como riesgo).

---

## 2. Puntaje general de accesibilidad

## **54 / 100** — Necesita trabajo significativo

| Principio POUR | Estimado | Razón principal |
|---|---|---|
| Perceptible | 52% | Contraste roto en 2 plantillas, iconos decorativos sin `aria-hidden`, estados por color sin refuerzo en algunos casos |
| Operable | 50% | Sin skip link, varias interacciones solo-mouse, fugas de foco en diálogos, muchos touch targets <44px |
| Comprensible | 58% | Formularios generalmente etiquetados, pero identificación/sugerencia de errores no llega a AT en ningún flujo |
| Robusto | 55% | Tabs, radios y diálogos personalizados sin rol/estado ARIA; casi cero `aria-live` |

*(Metodología: puntaje heurístico basado en proporción de criterios de éxito aplicables que pasan completamente vs. parcialmente vs. fallan, ponderado por severidad y alcance de cada hallazgo. No es un score de herramienta automatizada tipo Lighthouse/axe — esas herramientas detectarían un subconjunto menor de lo encontrado aquí porque la mayoría de los problemas son de comportamiento dinámico/foco, no estáticos.)*

### Cumplimiento estimado de WCAG 2.2 AA por criterio de éxito afectado

| SC | Nombre | Estado |
|---|---|---|
| 1.1.1 | Contenido no textual | ⚠️ Parcial — iconos decorativos sin `aria-hidden`, algunas imágenes redundantes |
| 1.3.1 | Info y relaciones | ❌ Falla — labels sin asociar, tablas sin caption/scope, grupos sin fieldset |
| 1.3.5 | Identificar el propósito | ⚠️ Parcial — falta `autocomplete` en varios formularios de invitado |
| 1.4.1 | Uso del color | ⚠️ Parcial — 1-2 indicadores dependen solo de color, mitigados por texto adyacente |
| 1.4.3 | Contraste mínimo | ❌ Falla — plantillas Boda/Kids por debajo de 4.5:1 |
| 1.4.4 / 1.4.10 | Redimensionar texto / Reflow | ✅ Cumple — sin bloqueo de zoom detectado |
| 2.1.1 | Teclado | ❌ Falla — `GuestRow`, tarjeta feedback móvil, `ReactionPicker`, filas `<tr onClick>` |
| 2.1.2 | Sin trampa de teclado | ⚠️ Parcial — trap se rompe (no atrapa) en `ReportModal`, no en el sentido de "atrapa de más" |
| 2.3.3 | Animación por interacciones | ⚠️ Parcial — confetti ignora `prefers-reduced-motion` |
| 2.4.1 | Evitar bloques | ❌ Falla — sin skip link en ninguna ruta |
| 2.4.2 | Título de página | ⚠️ Parcial — falta en Landing/NotFound |
| 2.4.3 | Orden del foco | ❌ Falla — múltiples fugas de foco documentadas |
| 2.4.6 | Encabezados y etiquetas | ⚠️ Parcial — algunos títulos visuales no son heading real |
| 2.4.7 | Foco visible | ✅ Cumple en general (no auditado exhaustivamente por CSS, sin hallazgos de `outline: none` sin reemplazo) |
| 2.5.8 | Tamaño del objetivo (mínimo) | ❌ Falla — decenas de botones-ícono <44px |
| 4.1.2 | Nombre, rol, valor | ❌ Falla — tabs, radios y diálogos personalizados sin semántica ARIA |
| 4.1.3 | Mensajes de estado | ❌ Falla — prácticamente 0 uso de `aria-live`/`role="status"` en toda la app |

---

## 3. Problemas críticos (bloquean tareas para usuarios de AT/teclado)

| # | Hallazgo | Dónde |
|---|---|---|
| C1 | Formularios de auto-edición de invitado (`GuestEditModal`, `EventJoin`) sin `<label htmlFor>` | Ver **C-1** |
| C2 | Fila de invitado completa (`GuestRow`) inoperable por teclado — bloquea la gestión de invitados para usuarios de teclado/switch | Ver **D-1** |
| C3 | Tarjeta de feedback en vista móvil sin forma de abrir el detalle por teclado | Ver **D-1** |

---

## 4. Quick wins (menos de 30 minutos cada uno)

- **QW1** — Agregar `role="status" aria-live="polite"` al `<div>` raíz de `Toast.tsx` (arregla 3+ usos de golpe: check-in, avisos de email, "enlace copiado"). Ver **L-1**.
- **QW2** — Agregar `aria-hidden="true" focusable="false"` a la plantilla `<svg>` en `Icons.tsx` (arregla ~70 iconos de una sola vez). Ver **I-1**.
- **QW3** — Envolver `Navbar`'s links en un `<nav aria-label="Principal">`. Ver **A-2**.
- **QW4** — Agregar `<a href="#main-content" class="skip-link">Saltar al contenido</a>` en `AppShell`/`PublicLayout`/`BrowseLayout`, con `id="main-content"` en el `<main>`. Ver **B-1**.
- **QW5** — Envolver mensajes de éxito/error de acciones admin (`AdminDashboard`, `AdminReportsTab`, `EventManagementPanel`) en `role="alert"`. Ver **L-3**.
- **QW6** — Cambiar `role="dialog"` por `role="alertdialog"` en `Modal.tsx` para la variante `danger` de `ConfirmDialog`/`ExitConfirmDialog`. Ver **E-6**.
- **QW7** — Añadir `scope="col"` a todos los `<th>` de las 4 tablas admin. Ver **F-4**.
- **QW8** — Añadir `<caption class="sr-only">` a las 4 tablas admin. Ver **F-3**.
- **QW9** — Envolver `useWalkInCounter`'s mensaje en `role="status"`. Ver **L-2**.
- **QW10** — Excluir `matchMedia('(prefers-reduced-motion: reduce)')` antes de disparar `canvas-confetti` en los 5 puntos de llamada. Ver **M-1**.
- **QW11** — Agregar `useDocumentTitle` a `Landing.tsx` y `NotFound.tsx`. Ver **B-3**.
- **QW12** — Agregar `htmlFor`/`id` a los `<label>` de `PaymentProofForm.tsx`. Ver **C-2**.

## 5. Mejoras de alto impacto (más esfuerzo, mayor retorno)

- Crear un `Field` wrapper compartido (label + input + error) con `id` generado, `aria-describedby` y `aria-invalid` automáticos, y adoptarlo en todos los formularios de invitado (resuelve C-1, C-2, C-3, G-1 de una vez).
- Convertir `TabButton`/`ScrollableTabs` en un widget de tabs ARIA real (`role="tablist"/"tab"/"tabpanel"`, `aria-selected`) — se reutiliza en Admin y potencialmente en más lugares futuros.
- Corregir los tokens `accent`/`textMuted` de las plantillas Boda y Kids en `templates/registry.ts` (cambio de 2-4 valores hexadecimales, sin tocar layout).
- Implementar `aria-hidden`/`inert` en el contenido de fondo cuando un modal está abierto (un solo cambio en `Modal.tsx`).
- Agregar movimiento de foco + anuncio de paso en el wizard de creación de evento (`WizardContainer`) y en los pasos internos de `GuestSignupPrompt`/`GuestDetailSheet`.

---

## 6. Hallazgos detallados

Cada hallazgo incluye: título, severidad, criterios WCAG 2.2, ubicación, explicación, impacto (a quién afecta) y solución propuesta.

### A. HTML semántico y landmarks

#### A-1. Sin `<nav>` en la navegación primaria del Navbar de escritorio
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 1.3.1 | `src/components/Navbar.tsx:32-107` |

**Por qué es un problema:** El elemento raíz es `<header>` (línea 33) y los links Inicio/Invitaciones/Perfil/Salir viven en un `<div>` plano (línea 52), nunca dentro de `<nav>`. Contrasta con `BottomTabBar.tsx:32`, que sí usa `<nav>` correctamente.
**Impacto:** Usuarios de lector de pantalla que navegan por landmarks (NVDA/JAWS "navegar por regiones", VoiceOver rotor) no pueden saltar directo a la navegación principal en escritorio.
**Solución:** Envolver el `<div>` de links en `<nav aria-label="Principal">`.

#### A-2. Barra de salida del modo kiosko sin landmark
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 1.3.1 | `src/components/AppShell.tsx:38-59` (`KioskExitBar`) |

**Por qué es un problema:** Es el único elemento de orientación en `/pass/:eventId/:qrToken`, `/events/:id/arrive`, `/events/:id/join`, `/events/:id/wall` para un invitado autenticado, pero es un `<div>` sin rol de landmark.
**Impacto:** Invisible para navegación por landmarks.
**Solución:** Usar `<header>` o agregar `role="banner"`/`aria-label` según corresponda.

#### A-3. Título de sección de gráfica renderizado como `<p>` en vez de heading
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 1.3.1, 2.4.6 | `src/pages/Dashboard.tsx:158` |

**Por qué es un problema:** `<p className="text-xs font-semibold ...">Actividad (últimos 6 meses)</p>` etiqueta visualmente la sección pero no es un heading real.
**Impacto:** Usuarios que navegan por lista de encabezados (H de NVDA/JAWS) no ven esta sección en el outline.
**Solución:** Cambiar a `<h2>` (o `<h3>` según jerarquía) manteniendo el estilo vía className.

#### A-4. Sección "Hub" de Profile sin heading identificador
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 2.4.6 | `src/pages/Profile.tsx:291-343` |

**Por qué es un problema:** El primer bloque (Apariencia, Admin, Buzón, Cerrar sesión) no tiene `<h2>`, a diferencia de "Datos personales" (347), "Cuentas vinculadas" (420) y "Cambiar contraseña" (533) que sí lo tienen.
**Impacto:** Rompe la consistencia del outline de encabezados para navegación por AT.
**Solución:** Agregar un `<h2>` visualmente oculto o visible ("Cuenta") antes del bloque.

#### A-5. Encabezado del evento duplicado sin diferenciación (h1 + h2 con el mismo texto)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 2.4.6 | `src/pages/EventDetail.tsx:212` (h1 vía `ScreenHeader.tsx:57`) y `:268` (h2) |

**Por qué es un problema:** No es un salto de jerarquía inválido, pero el mismo texto se anuncia dos veces seguidas en el outline de encabezados, generando ruido.
**Impacto:** Usuarios de lector de pantalla escuchan el nombre del evento repetido sin contexto adicional.
**Solución:** Diferenciar el segundo heading (ej. agregar contexto visualmente oculto: "Resumen de {nombre}") o bajar su nivel/rol si es puramente decorativo.

---

### B. Navegación por rutas y gestión de foco global

#### B-1. Sin skip link en ninguna ruta
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 2.4.1 | Todo `src/` — `PublicLayout.tsx`, `BrowseLayout.tsx`, `AppShell.tsx` |

**Por qué es un problema:** Cada ruta (pública, browse, kiosko, focus) obliga a tabular por Navbar/BottomTabBar/KioskExitBar antes de llegar al contenido, sin mecanismo de bypass.
**Impacto:** Usuarios de teclado y lectores de pantalla repiten navegación redundante en cada carga/recarga de página.
**Solución:**
```tsx
<a href="#main-content" className="skip-link">Saltar al contenido</a>
...
<main id="main-content" tabIndex={-1}>
```
con CSS que lo oculte visualmente hasta recibir foco (`.skip-link:focus { ... }`).

#### B-2. Sin gestión de foco ni anuncio en cambios de ruta
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 2.4.3 (y 2.4.1 indirectamente) | `src/App.tsx`, `src/main.tsx`, `src/lib/sentry.ts` |

**Por qué es un problema:** `SentryRoutes` solo agrega tracing de performance. No hay componente que mueva el foco a `<main>` o al `<h1>` de la nueva página tras una navegación por `<Link>`, ni scroll-to-top general (solo `EventDetail.tsx` hace `scrollIntoView` para hashes puntuales, sin `.focus()`). Tampoco hay `aria-live` que anuncie el cambio de página (grep de `aria-live` en todo `src/`: 0 coincidencias fuera de `CrownLoader`).
**Impacto:** Usuarios de teclado pierden orientación de dónde quedó el foco tras navegar; usuarios de lector de pantalla no reciben ninguna señal de que la página cambió salvo que noten el título (que tampoco siempre se actualiza, ver B-3).
**Solución:** Crear un componente `RouteAnnouncer` montado una vez en `App.tsx` que, en cada cambio de `location.pathname`, mueva el foco a `<main tabIndex={-1}>` y anuncie el nuevo `document.title` vía una región `aria-live="polite" class="sr-only"`.

#### B-3. `useDocumentTitle` no se llama en `Landing.tsx` ni `NotFound.tsx`
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 2.4.2 | `src/pages/Landing.tsx`, `src/pages/NotFound.tsx` |

**Por qué es un problema:** Las otras 8 páginas (`Dashboard`, `EventDetail`, `Reports`, `AdminDashboard`, `Profile`, `MyInvitations`, `Scanner`, `Feedback`) sí llaman `useDocumentTitle`. Como su cleanup restaura el título previo al desmontar, navegar hacia `NotFound` o de vuelta a `/` desde una ruta interna deja un `document.title` obsoleto (ej. "Inicio · PaseLink" al entrar a una URL rota).
**Impacto:** El título de pestaña/anuncio de página es la primera señal de orientación para un usuario de lector de pantalla tras navegar; un título incorrecto confunde.
**Solución:** Agregar `useDocumentTitle('PaseLink - Gestión de eventos')` en `Landing.tsx` y `useDocumentTitle('Página no encontrada')` en `NotFound.tsx`.

#### B-4. `TabButton`/`ScrollableTabs` (tabs de Admin) sin semántica ARIA de tabs
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 4.1.2 | `src/components/TabButton.tsx:20-43`, `src/components/ScrollableTabs.tsx:11-17`, uso en `src/pages/AdminDashboard.tsx:403-409` |

**Por qué es un problema:** Visualmente es una barra de tabs (subrayado + fondo activo) que cambia el panel visible (Eventos/Clientes/Buzón/Reportes/Actividad), pero se implementa con `<button>` planos sin `role="tab"`, `aria-selected`, `role="tablist"` en el contenedor, ni `role="tabpanel"` en el contenido.
**Impacto:** Usuarios de lector de pantalla no reciben "tab 2 de 5, seleccionado" ni saben que hay navegación por flechas disponible.
**Solución:** Envolver en `role="tablist"`, cada `TabButton` con `role="tab" aria-selected={active} aria-controls="panel-id"`, y el contenido con `role="tabpanel" id="panel-id" aria-labelledby="tab-id"`. Agregar manejo de flechas izquierda/derecha (patrón APG Tabs).

---

### C. Formularios — Labels y asociación

#### C-1. `<label>` sin asociar en formularios de auto-edición y auto-registro de invitado
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| **Crítica** | 1.3.1, 3.3.2, 4.1.2 | `src/components/GuestEditModal.tsx:108,119,129,147,158,169` y `src/pages/EventJoin.tsx:255,268,282,313,333,350,366` (constantes compartidas `labelClass`/`inputClass` de `EventJoin.tsx:24-26`) |

**Por qué es un problema:** Cada `<label className={labelClass}>` no tiene `htmlFor`, y el `<input>`/grupo siguiente no tiene `id` coincidente. Visualmente el label está arriba del campo, pero no hay asociación programática — el campo no tiene nombre accesible en absoluto.
**Impacto:** Usuarios de lector de pantalla no pueden identificar qué está pidiendo cada campo (nombre, apellido, teléfono, email, campos personalizados) en los dos formularios de mayor tráfico de invitado de toda la app — el de auto-registro (`EventJoin`) y el de auto-edición (`GuestEditModal`).
**Solución:**
```tsx
<label htmlFor="guest-first-name" className={labelClass}>Nombre</label>
<input id="guest-first-name" ... />
```
Recomendado: extraer un componente `FormField` reutilizable que genere el `id` con `useId()` y lo aplique a label + input + mensaje de error automáticamente.

#### C-2. `<label>` sin asociar — formulario de comprobante de pago
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 1.3.1, 4.1.2 | `src/components/PaymentProofForm.tsx:31-43` |

**Por qué es un problema:** Mismo patrón que C-1: `<label>` sin `htmlFor`, `<input required>` sin `id`.
**Impacto:** Usuarios de lector de pantalla no identifican el campo "Número de referencia" al reportar un pago.
**Solución:** Igual que C-1.

#### C-3. `<label>` sin asociar — edición de invitados desde el organizador
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 1.3.1, 3.3.2 | `src/components/GuestList/GuestEditForm.tsx:61-90` (`EditGuestRow`), `:159-178` (`EditGroupRow`) |

**Por qué es un problema:** Los campos nombre/apellido/teléfono/"integrantes" usan solo `placeholder` ("Nombre", "Apellido", "Teléfono", "Nombre del grupo", "Integrantes") — no hay ningún `<label>`, ni siquiera sin asociar.
**Impacto:** Igual que C-1/C-2, en el flujo de edición masiva/rápida que usa el organizador.
**Solución:** Agregar `<label>` visualmente oculto (`sr-only`) asociado por `htmlFor`/`id` a cada input.

#### C-4. Placeholder como único label en formularios de alta de invitado y campos personalizados
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 1.3.1, 3.3.2 | `src/components/CompanionFields.tsx:69-96`, `src/components/GuestAddForm.tsx:247-341`, `src/components/CustomFieldsBuilder.tsx:51-57`, `src/components/CustomFieldsEditor.tsx:22-33` |

**Por qué es un problema:** Ninguno de estos inputs tiene `<label>`, `aria-label` o `aria-labelledby` — solo `placeholder`. El placeholder desaparece al escribir y muchos lectores de pantalla no lo exponen de forma confiable como nombre accesible.
**Impacto:** Afecta el flujo de alta manual de invitados (uno de los más usados por organizadores) y la configuración de campos personalizados del evento.
**Solución:** Igual que C-1 — asociar label real (visible u oculto) a cada input.

#### C-5. Filas de acompañantes repetidas sin diferenciación de texto
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 1.3.1, 2.4.6 | `src/components/CompanionFields.tsx:67-109` |

**Por qué es un problema:** Con 2+ acompañantes, cada fila repite exactamente "Nombre (opcional)"/"Apellido (opcional)"/"Teléfono (opcional)" sin número de orden, a diferencia de `TimelineEditor.tsx`, que sí desambigua con `aria-label={\`Hora del momento ${i+1}\`}`.
**Impacto:** Un usuario de lector de pantalla no puede distinguir en qué acompañante está parado.
**Solución:** Incluir el índice en el label: `Nombre del acompañante ${i+1} (opcional)`.

#### C-6. Campos personalizados obligatorios nunca marcados `required` en formularios del organizador
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 3.3.2 | `src/components/GuestAddForm.tsx:283-291,332-341`, `src/components/CustomFieldsEditor.tsx:22-33` |

**Por qué es un problema:** `CustomField.required` existe en el modelo de datos (definido en `CustomFieldsBuilder.tsx:69-71`), pero `customFieldInputProps()` solo devuelve `type`/`inputMode`, nunca `required`. Solo `EventJoin.tsx:355` (auto-registro del invitado) sí lo pasa.
**Impacto:** Organizadores y usuarios de AT que editan/agregan invitados manualmente no reciben ninguna señal de qué campos son obligatorios.
**Solución:** Pasar `required={field.required}` también en `GuestAddForm`/`GuestEditModal`/`GuestList/GuestEditForm`.

#### C-7. Campos visualmente requeridos (`*`) sin atributo `required` en el wizard de creación de evento
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 3.3.2, 4.1.2 | `src/components/EventCreation/steps/StepBasicInfo.tsx:42,58` ("Nombre del evento *", "Lugar *"), `src/components/EventCreation/steps/StepInvitationMethod.tsx:93` ("Límite de invitados *") |

**Por qué es un problema:** El modo edición equivalente (`EditEventForm.tsx:424-439,558`) sí tiene `required`; el wizard de creación no. Solo el asterisco visual comunica obligatoriedad, y ni siquiera eso se anuncia como "requerido" en la mayoría de lectores de pantalla.
**Impacto:** Usuarios de AT no saben qué campos deben completar antes de avanzar de paso.
**Solución:** Agregar `required` a los 3 inputs señalados.

#### C-8. Mensajes de error no asociados al campo ni anunciados (sistémico)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| **Alta (sistémica)** | 3.3.1, 3.3.3, 4.1.3 | `src/components/FieldError.tsx:6-9`, `src/components/FormError.tsx:8-15`, `src/components/AuthErrorMessage.tsx:4-16`, `src/components/TextField.tsx:56` |

**Por qué es un problema:** Estos componentes compartidos renderizan un `<p>` plano sin `id`, sin `role="alert"` y sin `aria-live`. Como `TextField` no genera ni pasa un `id` al error, ningún llamador de la app puede conectar el campo con su mensaje vía `aria-describedby`, ni el input recibe `aria-invalid`. Afecta prácticamente todos los formularios: `Login`, `Register`, `ResetPassword`, `EventJoin`, `GuestAddForm`, `GuestEditModal`, `GuestList/GuestEditForm`, `EditEventForm`, `EventCreate`, `Feedback`.
**Impacto:** Cuando falla una validación, un usuario de lector de pantalla no se entera de que apareció un error, ni cuál campo lo causó, a menos que navegue manualmente todo el formulario de nuevo.
**Solución:**
```tsx
// TextField.tsx
const errorId = useId()
<input aria-invalid={!!error} aria-describedby={error ? errorId : undefined} ... />
<FieldError id={errorId} role="alert">{error}</FieldError>
```

#### C-9. Sin gestión de foco tras un envío fallido
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 3.3.1, 4.1.3 | `Login.tsx:31-43`, `Register.tsx:65-85`, `ResetPassword.tsx:34-55`, `EditEventForm.tsx:351-380`, `EventCreate.tsx:242-296`, `EventJoin.tsx:131-196`, `GuestAddForm.tsx:102-110` |

**Por qué es un problema:** Tras un submit fallido, el foco permanece en el botón; el error recién renderizado nunca recibe foco ni se anuncia (ver C-8), especialmente grave en formularios largos como `EditEventForm` o el paso 7 de `EventCreate`.
**Impacto:** Usuarios de teclado/lector de pantalla no descubren por qué "no pasó nada" tras enviar.
**Solución:** Al fallar la validación, mover foco al primer campo inválido o al contenedor de error con `tabIndex={-1}` + `.focus()`.

#### C-10. Selección de modo de ingreso / método de pago sin semántica de grupo de opciones
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 1.3.1, 4.1.2 | `src/components/EventCreation/EntryModeSelector.tsx:42-87`, `src/components/EditEventForm.tsx:541-555`, `src/pages/EventJoin.tsx:372-385` |

**Por qué es un problema:** Tres opciones mutuamente excluyentes se implementan como `<button type="button">` con solo indicación visual (borde/anillo/punto) de selección — sin `role="radio"`/`radiogroup`, sin `aria-checked`/`aria-pressed`, sin `<fieldset>/<legend>` que agrupe las tres como una sola elección. En modo edición (`EditEventForm.tsx:541-555`) las tarjetas ni siquiera son interactivas y el valor actual se comunica solo por color/opacidad. Contrasta con el patrón correcto ya usado en `Feedback.tsx:117-131` (`aria-pressed={active}`).
**Impacto:** Es una decisión crítica del evento (no se puede cambiar después) sin ninguna exposición de estado accesible.
**Solución:** Usar `role="radiogroup"` + `role="radio" aria-checked` (o `aria-pressed` si se mantiene como botones), envuelto en `<fieldset><legend>Modo de ingreso</legend>`.

#### C-11. Grupos de checkboxes de métodos de cobro sin `<fieldset>`/`<legend>`
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 1.3.1 | `src/components/EditEventForm.tsx:592-609`, `src/components/EventCreation/steps/StepInvitationMethod.tsx:155-184` |

**Por qué es un problema:** El título del grupo ("Métodos de cobro") es un `<label>` suelto que no está conectado a nada.
**Impacto:** Un usuario que navega checkbox por checkbox no escucha el contexto de grupo.
**Solución:** `<fieldset><legend>Métodos de cobro</legend>{checkboxes}</fieldset>`.

#### C-12. Contador de acompañantes ("¿Cuántos vienen?") no anuncia el cambio
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 4.1.3 | `src/pages/EventJoin.tsx:282-311` |

**Por qué es un problema:** Un stepper personalizado −/+ actualiza `<span>{partySize}</span>` sin `aria-live`.
**Impacto:** Usuarios de lector de pantalla que presionan "Sumar/Restar acompañante" no reciben confirmación auditiva del nuevo valor.
**Solución:** `<span aria-live="polite">{partySize}</span>` o usar un `<input type="number">` nativo.

#### C-13. Cambio de paso del wizard no se anuncia, sin heading de paso
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 2.4.3, 2.4.6, 4.1.3 | `src/components/Wizard/WizardContainer.tsx:42-70`, `src/components/Wizard/WizardStep.tsx:9-14`, `src/pages/EventCreate.tsx:214-240` |

**Por qué es un problema:** El indicador de progreso ("1/7", barra, label del paso) es texto plano sin `aria-live`. `handleNext`/`handlePrevious` solo llaman `window.scrollTo(...)` (scroll visual, nunca `.focus()`). El label del paso es un `<p>`, no un heading — ningún `Step*.tsx` tiene `<h2>` propio.
**Impacto:** Usuarios de lector de pantalla que navegan por encabezados no encuentran "Paso 2 de 7 — Método de invitación", y quienes avanzan de paso no reciben ningún anuncio del cambio.
**Solución:** Cada `Step*.tsx` debe tener su propio `<h2>`; al cambiar de paso, mover foco a ese heading y anunciar el progreso vía región `aria-live="polite"`.

#### C-14. `autocomplete` ausente en campos de contacto propio del invitado
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 1.3.5 | `src/components/GuestEditModal.tsx:109-154` |

**Por qué es un problema:** `EventJoin.tsx:259,272,323,338` sí define `autoComplete="given-name"|"family-name"|"tel"|"email"` para los mismos datos en el registro; `GuestEditModal` (el invitado editando sus propios datos) no.
**Impacto:** Usuarios con autocompletado de navegador o tecnologías de asistencia de propósito de campo no reciben ayuda al editar su propio contacto.
**Solución:** Replicar los mismos valores de `autoComplete` de `EventJoin` en `GuestEditModal`.

#### C-15. `autocomplete` ausente en campos ingresados por el organizador (menor prioridad)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 1.3.5 | `src/components/GuestAddForm.tsx:247-276`, `src/components/GuestList/GuestEditForm.tsx:61-90`, `src/components/CompanionFields.tsx:69-96` |

**Solución:** Igual, aunque menor impacto porque es un tercero quien escribe.

#### C-16. Errores de importación CSV no asociados al control que los originó
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja/Media | 3.3.1, 4.1.3 | `src/components/GuestAddForm.tsx:374,394-399`, `src/components/EditEventForm.tsx:675-684`, `src/pages/EventCreate.tsx:468-481` |

**Solución:** Igual patrón que C-8 (`role="alert"` + `aria-describedby`).

---

### D. Navegación por teclado y widgets personalizados

#### D-1. Interacciones primarias construidas con `<div>`/`<tr onClick>` sin equivalente de teclado
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| **Crítica** (GuestRow, tarjeta feedback móvil) / Media (filas `<tr>` con botón redundante) | 2.1.1, 4.1.2 | `src/components/GuestList/GuestRow.tsx:187-197`, `src/components/Admin/AdminFeedbackTable.tsx:147-196` (tarjeta móvil, sin botón alterno), `src/components/Admin/AdminFeedbackTable.tsx:217-221` y `src/components/Admin/AdminReportsTable.tsx:165-169` (`<tr onClick>`, con ícono de "ver" redundante como alternativa) |

**Por qué es un problema:** Ninguno de estos elementos tiene `role="button"`, `tabIndex={0}` ni `onKeyDown` para Enter/Espacio. En `GuestRow` es la **única** forma de abrir el detalle de un invitado o alternar su selección — no existe otro control que llegue al mismo destino. En la tarjeta de feedback móvil tampoco hay botón "ver" alterno (a diferencia de la vista de escritorio, que sí tiene un ícono de ojo redundante).
**Impacto:** Usuarios de teclado y acceso por switch **no pueden gestionar invitados en absoluto** desde `GuestRow`, ni abrir un mensaje de feedback desde el móvil. Es el hallazgo de mayor impacto funcional de toda la auditoría junto con C-1.
**Solución:** Agregar `role="button" tabIndex={0}` y `onKeyDown` (Enter/Espacio → misma acción que `onClick`) a la fila, o —mejor— reemplazar el contenedor por un `<button>` real que envuelva el contenido con `display: flex` y reset de estilos de botón.

#### D-2. `ReactionPicker`: menú de reacciones inalcanzable por teclado
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 2.1.1 | `src/components/ReactionPicker.tsx:100-103,118-123,144-164` |

**Por qué es un problema:** El popup de tipos de reacción (`role="menu"`) solo se abre con `onMouseEnter` (retardo de 400ms) o `onTouchStart` (long-press). El `onClick` del botón principal alterna directamente el "like" sin abrir el menú. No hay `onFocus`/`onKeyDown` que lo abra.
**Impacto:** Un usuario de teclado que tabula hasta este control solo puede alternar "like" — el resto de reacciones son inaccesibles pese a tener `role="menu"`/`aria-haspopup="menu"` declarados.
**Solución:** Abrir el menú también con `onFocus` o con una tecla (flecha abajo/Enter mantenido), siguiendo el patrón APG Menu Button.

#### D-3. `PhotoViewer` (visor de fotos a pantalla completa) sin ningún patrón de diálogo accesible
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 4.1.2, 2.4.3, 2.4.11 | `src/components/PhotoViewer.tsx` (archivo completo) |

**Por qué es un problema:** A diferencia de todo el resto de overlays de la app, no usa `Modal`/`useModalA11y`: no tiene `role="dialog"`/`aria-modal`, no mueve foco al abrir ni lo restaura al cerrar, y no atrapa Tab/Shift+Tab (solo intercepta Escape/flechas vía listener en `window`). El foco puede salir del visor hacia elementos de la página de fondo que siguen en el DOM detrás del overlay opaco.
**Impacto:** Usuarios de teclado pueden "perder" el foco en un elemento invisible tras el overlay negro; usuarios de lector de pantalla no reciben nombre/rol del visor.
**Solución:** Migrar `PhotoViewer` a usar `useModalA11y` como el resto de la app, o replicar manualmente: `role="dialog" aria-modal="true" aria-label`, trap de Tab, foco inicial y restauración al cierre.

#### D-4. Contenido de fondo no se oculta a tecnología de asistencia mientras un modal está abierto
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media (sistémica) | 4.1.2 | `src/components/Modal.tsx:76-83`, `src/hooks/useModalA11y.ts` — afecta a todos los diálogos construidos sobre este patrón |

**Por qué es un problema:** `Modal` se porta a `document.body` y marca `aria-modal="true"`, pero nada aplica `aria-hidden="true"`/`inert` al resto de la app. `aria-modal` es solo una pista declarativa que no todos los lectores de pantalla respetan de forma estricta; sin ocultar físicamente el fondo, el cursor virtual de un lector de pantalla puede seguir navegando contenido detrás del modal.
**Impacto:** Usuarios de lector de pantalla pueden "salirse" del contexto del modal sin darse cuenta.
**Solución:** En `Modal.tsx`, al montar, aplicar `inert` (o `aria-hidden="true"`) al resto de hijos de `#root`/`document.body` y revertirlo al desmontar.

#### D-5. Un elemento `disabled` en el borde del trap rompe el atrapado de foco
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 2.4.3 | `src/hooks/useModalA11y.ts:4` (`FOCUSABLE_SELECTOR`), manifestado en `src/components/ReportModal.tsx:175` |

**Por qué es un problema:** El selector `'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'` no excluye `:disabled`. En `ReportModal`, el botón "Enviar" está `disabled` mientras el textarea está vacío y es el último elemento enfocable del DOM. Como los navegadores nunca enfocan un elemento `disabled`, `document.activeElement` nunca coincide con ese `last` calculado, así que la rama que envuelve el Tab hacia adelante nunca dispara — el foco **se escapa del modal** hacia la página de fondo. Shift+Tab desde el botón "Cerrar" del header también falla (intenta `.focus()` sobre un elemento deshabilitado, que es un no-op).
**Impacto:** Rotura real y reproducible del atrapado de foco, no solo teórica.
**Solución:** Filtrar el `querySelectorAll` con `:not(:disabled)` o recalcular `first`/`last` en cada `keydown` en vez de una sola vez al montar.

#### D-6. Cambios internos de paso/panel dentro de un modal ya abierto sueltan el foco a `<body>`
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 2.4.3, 4.1.3 | `src/components/GuestSignupPrompt.tsx:86-90,142-348`, `src/components/GuestList/GuestDetailSheet.tsx:158-159,264-267` |

**Por qué es un problema:** Cuando estos componentes cambian su `step`/`editing` interno, el botón que disparó el cambio (ej. "Crear cuenta", "Editar datos") se desmonta. `useModalA11y` solo gestiona foco en la transición `open` (dependencia `[open]`), no en estos cambios internos. Al desmontar React el elemento enfocado, el navegador resetea el foco a `<body>` — que no es ni `first` ni `last` del trap, por lo que el siguiente Tab escapa del modal usando el orden natural del documento en vez del trap.
**Impacto:** Se pierde tanto el contexto anunciado (nuevo panel sin heading enfocado) como el atrapado de foco. Especialmente grave en la transición automática de `GuestSignupPrompt` a `'login'` tras un registro fallido (línea 86-90), que ocurre sin ninguna acción del usuario.
**Solución:** Al cambiar de paso/panel, mover foco explícitamente al heading o primer campo del nuevo panel (`ref.current?.focus()` en un `useEffect([step])`).

#### D-7. Diálogos de decisión/destructivos usan `role="dialog"` en vez de `role="alertdialog"`
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 4.1.2 | `src/components/Modal.tsx:78` (sin variante configurable), `src/components/ExitConfirmDialog.tsx:30`, `src/components/ScanResultModal.tsx:74` (estados `payment_required`/`exit_blocked`), variante `danger` de `ConfirmDialog` |

**Solución:** Agregar un prop `alertdialog?: boolean` a `Modal` y usarlo en confirmaciones destructivas y bloqueos de salida.

---

### E. Diálogos, drawers y sheets (síntesis adicional)

#### E-1. `DraftRecoveryModal`: Escape es intencionalmente un no-op
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja (informativo) | — | `src/components/DraftRecoveryModal.tsx:11-18` |

**Nota:** Es una elección deliberada de diseño (decisión binaria forzada tipo "cambios sin guardar"); Tab/Shift+Tab siguen ciclando con normalidad entre los dos botones reales, así que **no** constituye una trampa de teclado (2.1.2 no se viola). Se documenta solo por consistencia con el patrón APG, que recomienda que Escape cierre diálogos salvo excepción justificada como esta.

#### E-2. Bottom sheets — verificado sin violación
`GuestDetailSheet`, `GuestSearchSheet`, `ReactionListSheet`, `LegalDocumentSheet`, `ShareFallbackSheet` se renderizan a través de `Modal` (sin gestos de swipe como único método de cierre); todos ofrecen botón de cierre, click en backdrop y Escape. No se encontró trampa de teclado.

---

### F. Tablas y datos tabulares

#### F-1. Estado "no leído" en Buzón de feedback comunicado solo por color + `title`
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 1.4.1, 4.1.2 | `src/components/Admin/AdminFeedbackTable.tsx:154,165-167,220-224` |

**Por qué es un problema:** Un punto de color (`bg-primary`) con `title="No leído"` marca lo no leído, más negrita en la fila. `title` en un `<span>` no interactivo no se expone de forma confiable por lectores de pantalla, y no hay `aria-label`/texto oculto alternativo.
**Impacto:** Usuarios de lector de pantalla no distinguen mensajes leídos de no leídos.
**Solución:** Agregar `<span className="sr-only">No leído</span>` junto al punto, o `aria-label="No leído"` en el elemento contenedor de la fila.

#### F-2. Filas clicables (`<tr onClick>`) sin afordance de teclado en la fila misma
Ver **D-1** (ya cubierto, listado aquí solo por referencia cruzada de categoría).

#### F-3. Tablas sin `<caption>` ni nombre accesible
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 2.4.6, 1.3.1 | `AdminEventsTable.tsx:242`, `AdminFeedbackTable.tsx:202`, `AdminReportsTable.tsx:144`, `AdminUsersTable.tsx:128` |

**Solución:** `<caption className="sr-only">Lista de eventos</caption>` (idem para las otras 3).

#### F-4. Celdas `<th>` sin `scope="col"` explícito
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 1.3.1 | Mismas 4 tablas, filas de encabezado |

**Solución:** Agregar `scope="col"` a cada `<th>`.

---

### G. Dashboards, gráficas y KPIs

#### G-1. Gráfica de actividad del Dashboard sin ningún valor numérico expuesto
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 1.1.1 | `src/pages/Dashboard.tsx:156-179` ("Actividad (últimos 6 meses)") |

**Por qué es un problema:** Las barras son `<div>` con `height` calculado por `count`, sin renderizar el número en ningún lado (a diferencia de `AdminActivityChart.tsx:33`, que sí imprime el conteo sobre cada barra).
**Impacto:** Usuarios de lector de pantalla y de baja visión no tienen forma de percibir los valores reales, solo los meses.
**Solución:** Imprimir el número sobre/junto a cada barra, replicando el patrón ya usado en `AdminActivityChart`.

#### G-2. Gráficas sin agrupación semántica ni resumen accesible
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 1.1.1, 1.3.1 | `src/components/Admin/AdminActivityChart.tsx:22-45`, `src/components/EventAnalytics.tsx:80-113`, `src/pages/Reports.tsx:247-271` |

**Por qué es un problema:** Estas 3 sí imprimen el valor numérico por barra (correcto), pero la gráfica completa no tiene `role="img"`/`aria-label` de resumen ni tabla de respaldo — es una secuencia de números sueltos sin el contexto "esto es Eventos por mes".
**Solución:** Envolver en `<figure role="group" aria-label="Eventos por mes"><figcaption class="sr-only">...</figcaption>...</figure>`.

#### G-3. Tarjetas KPI (`MetricTile`) sin agrupación programática de valor + etiqueta
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 1.3.1 | `src/components/MetricTile.tsx:37-57` |

**Solución:** Usar `<dl><dt>{label}</dt><dd>{value}</dd></dl>` en vez de dos `<p>` sueltos.

#### G-4. `AttendanceProgressBar` sin `role="progressbar"` (mejora, no incumplimiento)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja (informativo) | — | `src/components/AttendanceProgressBar.tsx:50-68` |

**Nota:** El mismo valor ya está en texto visible justo arriba de la barra ("12/40 check-ins, 30% asistencia"), por lo que **no** es un incumplimiento de 1.1.1. Se recomienda `role="progressbar" aria-valuenow/valuemax` solo como mejora de robustez.

---

### H. Botones, estados de carga y objetivos táctiles

#### H-1. Iconos decorativos nunca marcados `aria-hidden` (sistémico, ~70 iconos)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media (sistémica) | 1.1.1, 4.1.2 | `src/components/Icons.tsx` (todo el archivo: `type IconProps = { className?: string }`, línea 1) |

**Por qué es un problema:** Ningún ícono (`IconCheck`, `IconStar`, `IconCrown`, `IconTicket`, etc.) marca su `<svg>` como `aria-hidden`, y el tipo de props ni siquiera permite pasarlo desde el llamador. Ejemplos de uso puramente decorativo junto a texto visible: `IconTicket` junto al título del evento (`EventTicketCard.tsx:110`), `IconCrown` junto al nombre de autor (`WallSectionMessageCard.tsx:62`).
**Impacto:** VoiceOver en particular expone `<svg>` sueltos con rol "imagen" por defecto — se anuncia una "imagen" sin nombre interrumpiendo la lectura de la oración.
**Solución:** Agregar `aria-hidden="true" focusable="false"` directamente en la plantilla base de cada `<svg>` dentro de `Icons.tsx` (un solo cambio arregla los ~70 iconos).

#### H-2. Objetivos táctiles por debajo de 44×44px (patrón repetido)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media-Alta | 2.5.8 | Ver lista abajo |

**Nota positiva:** ya existe un patrón `min-w-11 min-h-11` (44px) adoptado en 19+ lugares (`Profile.tsx:83`, `ScreenHeader.tsx:51`, `PhotoViewer.tsx:213`, `DialogHeader.tsx:23`, `Admin/Pagination.tsx:25,37`, `WalkInCounter.tsx:21,26`, clase CSS `.wall-action-btn` en `index.css:1334`). El problema es que **no se aplica de forma consistente**:
- `WallSection.tsx:214` (refrescar muro): `p-1` con ícono `w-4 h-4` → ~24×24px.
- `WallSection.tsx:261` / `EventWall.tsx:428` ("Quitar foto"): `p-1` con `w-3.5 h-3.5` → ~22×22px.
- `EventDetail.tsx:277,290` ("Editar evento"/"Coorganizadores"): `p-2` con `w-4 h-4` → ~32×32px.
- `EventDetail.tsx:641,649` ("Copiar/Compartir enlace"): `p-2.5` con `w-4 h-4` → ~36×36px.
- `PhotoFeedCard.tsx:117` (pin/unpin): `p-2.5` con `w-3.5 h-3.5` → ~34×34px.
- `PhotoFeedCard.tsx:199` ("Cancelar respuesta"): sin padding, `w-4 h-4` → ~16×16px (el más pequeño confirmado).
- **`Admin/AdminReportsTable.tsx:186`** ("Ver reporte"): sin padding en absoluto → ~16×16px.
- **`Admin/AdminEventsTable.tsx:311,314,317`**: tres íconos de acción adyacentes (Ver/Reportes/**Eliminar**) sin padding, separados solo `gap-2` (8px) — riesgo real de toque accidental sobre "Eliminar" al intentar tocar "Ver".
- `Footer.tsx:67-79` (GitHub/Instagram): `w-8 h-8` (32×32px).

**Impacto:** Usuarios con movilidad reducida, temblor, o simplemente en un teléfono en movimiento, especialmente riesgoso en `AdminEventsTable` donde el botón destructivo está a 8px del botón de "ver".
**Solución:** Aplicar el patrón `min-w-11 min-h-11` ya existente en la app a los botones señalados; en `AdminEventsTable`, además, aumentar el `gap` entre "Ver"/"Reportes" y "Eliminar" o mover "Eliminar" a un menú secundario.

#### H-3. Estado de carga/ocupado no expuesto a tecnología de asistencia (`aria-busy` no usado nunca)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja-Media | 4.1.2, 4.1.3 | `src/components/Button.tsx:59` y todos sus usos |

**Por qué es un problema:** `disabled={disabled || loading}` usa correctamente el atributo HTML real (no solo un estilo), pero `aria-busy` no se usa en ningún lugar de la app (0 coincidencias), y el prop `loading` de `Button` en la práctica nunca se pasa — cada pantalla hace su propio `disabled={pending}` + cambio manual de texto (ej. `ShareEventButton.tsx:91-95`, `WallSection.tsx:283-286`).
**Impacto:** El único indicio de que una acción está en curso es el cambio de texto visible, que no todos los lectores de pantalla vuelven a anunciar automáticamente tras un cambio de estado `disabled`.
**Solución:** Agregar `aria-busy={loading}` en `Button.tsx` y adoptar el prop `loading` de forma consistente en vez de reimplementarlo por pantalla.

#### H-4. Link roto cuando la URL de mapa del organizador no es absoluta
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 2.4.4 | `src/components/EventMap.tsx:49-56` |

**Por qué es un problema:** Si `mapsUrl` no matchea `/^https?:\/\//i`, cae a `href="#"` pero mantiene `target="_blank"` y el label visible "Cómo llegar" — abre una pestaña en blanco sin avisar que el link está roto.
**Solución:** Si la URL no es válida, no renderizar el botón (o mostrarlo deshabilitado con explicación).

#### H-5. `alt` redundante en `Avatar` junto a nombre siempre visible
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 1.1.1 (buena práctica) | `src/components/Avatar.tsx:5` (`alt={name}`), usado junto al nombre visible en `WallSectionMessageCard.tsx:42+64`, `PhotoFeedCard.tsx:100+103` |

**Solución:** Cuando el nombre ya está visible adyacente, usar `alt=""` en el avatar (decorativo) en vez de repetir el nombre.

---

### I. Imágenes

*(Complementa H-1/H-5.)*

#### I-1. Patrón positivo verificado: `ProgressiveImage`
`src/components/ProgressiveImage.tsx:39-52` implementa correctamente el patrón de placeholder-blur: el `<img>` de placeholder lleva `alt="" aria-hidden="true"`, y la imagen real recibe el `alt` provisto por quien la usa. Sin hallazgos aquí — se documenta como referencia de buen patrón a replicar.

#### I-2. Sin `alt` faltante ni redundante tipo "imagen" detectado
Muestreo de `<img>` en toda la app no encontró `alt` ausente en imágenes con contenido informativo, ni `alt="imagen"`/`alt="foto"` genéricos.

---

### J. Contraste de color

Calculado con la fórmula de luminancia relativa WCAG sobre los tokens reales de `src/templates/registry.ts`.

#### J-1. Plantillas Boda y Kids: texto de acento sobre superficie falla contraste
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| **Alta** | 1.4.3 | `src/templates/registry.ts:78` (boda), `:198` (kids); consumido en `EventArrive.tsx:97,122`, `EventJoin.tsx:233`, `GuestPass.tsx:562,758,834`, `InvitationPreview.tsx:112` |

**Por qué es un problema:** Boda `#c9a35e` sobre `#fffbf5` = **2.29:1**; Kids `#e8916a` sobre `#fffaf3` = **2.33:1**. Ambos fallan el mínimo de 4.5:1 para texto normal e incluso el de 3:1 para texto grande. Se usa tanto en el horario del evento (24px bold) como en enlaces/mensajes de bienvenida (14px).
**Impacto:** Usuarios con baja visión no pueden leer el horario/mensaje del evento en estas 2 plantillas — es texto que ve el **invitado final**, no solo el organizador en el editor.
**Solución:** Oscurecer el valor de `accent` en ambas plantillas hasta alcanzar ≥4.5:1 sobre `surface` (ej. boda: de `#c9a35e` a algo ~`#8a6a2e`; verificar con herramienta de contraste tras el cambio).

#### J-2. Plantillas Boda y Kids: texto sobre badge de "check-in confirmado" falla contraste
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 1.4.3 | `src/components/GuestPassTicket.tsx:85`, `src/components/OrganizerPassView.tsx:71` |

**Por qué es un problema:** `text-[var(--invite-accent-dark)]` sobre `bg-[var(--invite-accent-soft)]` — Boda `#ad8542` sobre `#f6e9d3` = **2.82:1**; Kids `#c46a3f` sobre `#f8ddd0` = **2.96:1**. Ambos fallan 4.5:1.
**Solución:** Oscurecer `accent-dark` o aclarar más `accent-soft` en ambas plantillas hasta ≥4.5:1.

#### J-3. Plantilla Boda: texto atenuado (`textMuted`) sobre superficie falla contraste
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media-Alta | 1.4.3 | `src/templates/registry.ts:89` (`textMuted: '#9c8a7d'` vs `surface: '#fffbf5'` = **3.21:1**) |

**Impacto:** Usado en fecha/ubicación/código de vestimenta (`text-sm`) en `GuestPass.tsx`, `InvitationPreview.tsx`, `EventArrive.tsx`.
**Solución:** Oscurecer `textMuted` hasta ≥4.5:1.

#### J-4. Plantilla Kids: `textMuted` en el límite (falla por un margen pequeño)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja-Media | 1.4.3 | `registry.ts:206` — `#8a7363` vs `#fffaf3` = **4.29:1** (necesita 4.5:1) |

**Solución:** Ajuste menor del tono, ej. a `#83694f` o similar hasta cruzar el umbral.

#### J-5. Resto de plantillas (default, cowboy, graduation, formal, houseparty): verificado sin problema
Todas las combinaciones calculadas dan ≥4.29:1 (mayoría 5–17:1) — confirma que el problema es específico de los tokens de Boda/Kids, no un bug del motor de plantillas.

#### J-6. Texto superpuesto sobre imagen de portada — requiere verificación manual
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Informativo | 1.4.3 | `src/components/InvitationCard.tsx:32-39` |

**Nota:** No se encontró texto de plantilla superpuesto directamente sobre `coverImage` en los layouts revisados (el texto va sobre `--invite-surface`), pero como `coverImage` es una foto subida por el organizador, cualquier futuro layout que superponga texto directo sobre la imagen necesita verificación de contraste caso por caso — no es calculable estáticamente.

---

### K. Información transmitida solo por color

#### K-1. Punto de estado en `GuestRow` sin alternativa textual propia (mitigado, riesgo bajo)
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 1.4.1 | `src/components/GuestList/GuestRow.tsx:28-33,216` |

**Por qué es un problema:** El punto de 10px (ámbar=acción, verde=ok, gris=inactivo, violeta=espera) es un `<span>` sin texto/`aria-label` propio. En la práctica es redundante con el subtítulo adyacente (`getGuestSubtitle`), así que no se pierde información para AT, pero para usuarios con daltonismo el ámbar y el violeta (ambos de saturación media) son fáciles de confundir a simple vista.
**Solución:** Mantener `aria-hidden="true"` en el punto (ya que el texto adyacente cubre la semántica) pero verificar que ese texto exista en *todos* los estados, no solo los principales.

#### K-2. Verificado sin violación: badges de resultado de escaneo, `Pill`, `OrganizerPassView`
Todas las superficies de estado revisadas combinan color + ícono + texto (`ScanResultModal.tsx:48-63`, `GuestDetailSheet.tsx:25-38`). No se encontró un caso real de "solo color" fuera de K-1.

---

### L. Mensajes de estado y regiones `aria-live` (lectores de pantalla)

Esta es la brecha más extendida de la auditoría: **una sola región `role="status"`/`aria-live` existe en toda la aplicación** (`src/components/CrownLoader.tsx:15`, correctamente implementada). Todo lo demás listado abajo es silencioso para tecnología de asistencia.

#### L-1. Toasts nunca anunciados
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| **Alta** | 4.1.3 | `src/components/Toast.tsx:19-39`, usado por `useCheckinToast.ts:29-31` (auto-cierre 4000ms), `GlobalToastHost.tsx` (fallas de email, auto-cierre 6000ms), `ShareEventButton.tsx:107` ("Enlace copiado") |

**Impacto:** Notificaciones operativas en tiempo real en la puerta del evento (check-in) son invisibles para el personal que usa lector de pantalla.
**Solución:** `<div role="status" aria-live="polite">` en el contenedor raíz de `Toast.tsx` — arregla los 3 usos de una vez.

#### L-2. Mensaje del contador de walk-ins sin región viva, se borra en 2s
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 4.1.3 | `src/hooks/useWalkInCounter.ts:19`, `src/components/WalkInCounter.tsx:27-31` |

**Solución:** `role="status" aria-live="polite"`; considerar extender el timeout a ≥4s.

#### L-3. Confirmaciones/errores de acciones administrativas no anunciados
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 4.1.3 | `src/pages/AdminDashboard.tsx:374-379`, `src/components/Admin/AdminReportsTab.tsx:125-127`, `src/components/EventManagementPanel.tsx:91-95`, mensajes de sanción en `AdminReportDetail.tsx:328-329` |

**Por qué es un problema:** Tras acciones masivas destructivas (archivar/cancelar/eliminar eventos en lote, aplicar/revocar sanción), el `<p>` de confirmación/error no tiene `role="alert"`/`aria-live`.
**Solución:** `role="alert"` en estos mensajes.

#### L-4. Conteo de resultados de búsqueda/filtro nunca anunciado
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Alta | 4.1.3 | `AdminEventsTable.tsx:129-136` + `Pagination.tsx:17-19`, `AdminFeedbackTable.tsx:96-137`, `AdminUsersTable.tsx:81-88`, `AdminReportsTable.tsx:75-104` |

**Por qué es un problema:** Escribir en el buscador o cambiar un filtro recalcula "X–Y de Z" y/o el mensaje de "sin resultados" sin ninguna región viva.
**Solución:** Región `aria-live="polite"` que anuncie el nuevo conteo tras cada cambio de filtro (con debounce para no saturar).

#### L-5. Cambio de página de la tabla no anunciado
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 4.1.3 | `src/components/Admin/Pagination.tsx:20-42` |

**Solución:** `aria-live="polite"` en el texto "Página X de Y", más `aria-current="page"` si se agrega numeración de páginas clicable en el futuro.

#### L-6. Skeletons de carga sin estado accesible
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 4.1.3 | `src/components/Skeleton.tsx:1-3`, usado en las 4 tablas admin, `Reports.tsx:126-135`, `MetricTile.tsx:59-66` |

**Solución:** Envolver el contenedor de skeletons en `role="status" aria-label="Cargando"` (con contenido visualmente oculto tipo "Cargando…").

`LoadingInline.tsx` (usado en `EventAnalytics`, `Reports`) sí muestra texto visible ("Cargando asistentes…") pero tampoco tiene `aria-live` — mejora de baja prioridad.

#### L-7. Botón "Cargar más" no anuncia el contenido agregado
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja | 4.1.3 | `AdminReportsTable.tsx:208-218`, `Reports.tsx:333-340,373-380` |

**Solución:** Región viva que anuncie "N elementos cargados".

#### L-8. `ScanResultModal`: `aria-label` omite el dato operativo importante
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 4.1.2, 4.1.3 | `src/components/ScanResultModal.tsx:76` |

**Por qué es un problema:** El diálogo sí recibe foco (vía `useModalA11y`) y tiene `aria-label={styles.title}`, pero ese label solo trae el título corto ("Bienvenido/a") — no incluye `guestName` ni `detail` (quién entró, motivo del rechazo, monto pendiente), que es la información crítica para quien opera la puerta.
**Solución:** Incluir nombre/detalle en el `aria-label`, o asegurar que ambos estén dentro del contenido enfocado del diálogo para que se lean en la navegación natural.

#### L-9. Cierre automático del modal de escaneo (3.5s) sin pausa
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja-Media | 2.2.1 | `src/pages/Scanner.tsx:47,54,95-101` (`AUTO_CLOSE_MS = 3500`) |

**Solución:** Agregar una forma de extender/pausar el cierre automático (ej. al mover el mouse/tocar la pantalla), o aumentar el tiempo mínimo. Puede aplicar la excepción de "tiempo real esencial" del propio SC 2.2.1, pero conviene documentarlo explícitamente como decisión de producto.

#### L-10. Error de permiso de cámara no anunciado
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Baja-Media | 4.1.3 | `src/components/Scanner/CameraPermissionHandler.tsx:48-58`, renderizado condicionalmente en `Scanner.tsx:458-490` |

**Nota:** El texto del error es explícito y no depende de color (positivo), pero no está en una región viva — un usuario con foco en otro lado no se entera de que la cámara falló.
**Solución:** `role="alert"` en el panel de error de permisos.

#### L-11. Input de código manual sin label accesible
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 1.3.1, 4.1.2 | `src/components/Scanner/ManualCodeEntryDialog.tsx:40-47` |

**Por qué es un problema:** Solo tiene `placeholder="Pega el enlace o código del pase"`, sin `<label>`/`aria-label` propio (el diálogo sí tiene `aria-label` general, pero el input no).
**Solución:** Agregar `aria-label="Código o enlace del pase"` al input.

---

### M. Animación y movimiento

#### M-1. Confetti (`canvas-confetti`) ignora `prefers-reduced-motion`
| Severidad | WCAG 2.2 | Ubicación |
|---|---|---|
| Media | 2.3.3, 2.2.2 (referencia AAA, buena práctica AA) | `Scanner.tsx:143,163,321`, `GuestPass.tsx:281`, `Feedback.tsx:73`, `useWalkInCounter.ts:19`, `WelcomeModal.tsx:82` |

**Por qué es un problema:** `matchMedia` solo se usa para dark-mode y orientación en toda la app (2 usos) — ninguno para movimiento. Estos 7 puntos disparan ráfagas de partículas a pantalla completa sin condicionar por la preferencia del sistema operativo.
**Impacto:** Riesgo real para usuarios con trastornos vestibulares; se dispara en el flujo central del guardia de puerta (cada check-in exitoso), potencialmente decenas de veces por evento.
**Solución:**
```ts
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
if (!prefersReducedMotion) confetti({ ... })
```
Extraer a un helper `fireConfettiIfAllowed()` reutilizado en los 5 puntos.

#### M-2. Cobertura CSS de `prefers-reduced-motion`: positiva, ya extensa
`src/index.css` tiene **8** bloques `@media (prefers-reduced-motion: reduce)` que desactivan correctamente: animación de orbe de fondo, shimmer de skeletons, countdown, acordeón/stagger del menú móvil, utilidades `.animate-*`, swing/glow de mensajes del muro (tema cowboy), hover-lift de houseparty, animaciones del popup de reacciones y transform de tarjetas de ticket. No requiere acción — se documenta como base sólida sobre la que construir M-1.

---

### N. Tiempo, sesiones y expiraciones

#### N-1. Sin timeouts de sesión por inactividad detectados
Se buscó explícitamente lógica de `idleTimeout`/expulsión automática por inactividad en `src/firebase/auth.ts` y el resto de la app — no se encontró ninguna. La sesión de Firebase Auth persiste según su propio mecanismo estándar, sin un timer adicional de la app que cierre sesión sin aviso. **No se identificó riesgo bajo SC 2.2.1 por este concepto.**

#### N-2. Cierres automáticos con temporizador fijo (ver L-9, M — referencia cruzada)
El único patrón de "tiempo límite" real encontrado es el auto-cierre de 3.5s de `ScanResultModal` (L-9) y el mensaje de 2s de `WalkInCounter` (L-2) — ambos ya documentados arriba.

---

### O. Escáner QR (síntesis)

Cubre hallazgos ya listados en L-10, L-11, más:

#### O-1. Verificado sin violación: color no es el único indicador de error de cámara
`CameraPermissionHandler.tsx:48-58` combina ícono + texto explícito con pasos numerados específicos por sistema operativo — no depende de color. Solo falta la región viva (L-10).

---

### P. Plantillas de invitación (síntesis)

Los hallazgos de contraste de plantillas están en la sección J. Verificación adicional específica de plantillas:

#### P-1. Orden del DOM y lectura: sin hallazgos negativos
No se detectó contenido de plantilla que dependa de posicionamiento CSS puro (`position: absolute` desconectado del flujo lógico) que alterara el orden de lectura de un lector de pantalla en los componentes revisados (`GuestPassTicket.tsx`, `InvitationCard.tsx`, `InvitationPreview.tsx`).

---

### Q. Accesibilidad responsive / zoom

#### Q-1. Verificado sin violación: zoom no bloqueado
`index.html` no restringe `user-scalable` ni fija `maximum-scale` en el `<meta name="viewport">` — cumple 1.4.4 (redimensionar texto) y 1.4.10 (reflow) en el aspecto de configuración base. No se auditó exhaustivamente el comportamiento real a 400% de zoom en cada pantalla (requiere prueba manual en navegador, ver sección "Pendientes").

---

### R. Rendimiento relacionado con accesibilidad

#### R-1. Sin virtualización de listas largas
Se confirmó (grep) que no se usa `react-window`/`react-virtual` ni virtualización manual en ninguna lista, incluyendo `src/components/GuestList/GuestList.tsx` (471 líneas). Para eventos con cientos/miles de invitados, esto puede producir un DOM muy grande, lo cual generalmente degrada más el desempeño de lectores de pantalla (recorrido más lento del árbol de accesibilidad) que el de usuarios sin AT.
**Severidad:** Baja-Media (depende del volumen real de invitados por evento; no verificado con datos de producción).
**Solución sugerida:** Evaluar virtualización si el volumen típico de invitados por evento supera unos cientos de filas simultáneas renderizadas.

---

### S. Internacionalización

#### S-1. `lang="es"` estático, app monolingüe — sin hallazgos
`index.html` define `lang="es"` correctamente y no se encontró contenido en otro idioma que requiriera `lang` inline en `.tsx`. Como la app es monolingüe (español), esto es correcto y suficiente — no se identificó ninguna brecha de i18n relevante a WCAG 3.1.1/3.1.2 dentro del alcance auditado.

---

## 7. Roadmap priorizado

### Fase 1 — Crítico (bloquea tareas, arreglar primero)
1. **C-1 / C-2 / C-3 / C-4** — Asociar todos los `<label>` sin `htmlFor`/`id` en formularios de invitado (auto-edición, auto-registro, alta manual, comprobante de pago, campos personalizados). Recomendado: crear un `FormField` compartido con `useId()` y adoptarlo.
2. **D-1** — Hacer `GuestRow` y la tarjeta de feedback móvil operables por teclado (rol de botón + `tabIndex` + `onKeyDown`, o convertir a `<button>` real).
3. **L-1** — Agregar `role="status" aria-live="polite"` a `Toast.tsx` (arregla check-in, avisos de email y "enlace copiado" de una vez).
4. **C-8** — Asociar mensajes de error a sus campos (`aria-describedby`, `aria-invalid`, `role="alert"`) en el `TextField`/`FieldError` compartidos.
5. **D-5** — Corregir el `FOCUSABLE_SELECTOR` de `useModalA11y` para excluir `:disabled` (arregla la fuga de foco de `ReportModal` y cualquier otro modal futuro con botón deshabilitado en el borde).
6. **B-1** — Agregar skip link.
7. **J-1 / J-2 / J-3 / J-4** — Corregir los tokens de color de las plantillas Boda y Kids.

### Fase 2 — Importante (impacto amplio, esfuerzo moderado)
1. **D-2, D-3, D-6** — `ReactionPicker` operable por teclado; `PhotoViewer` migrado al patrón `useModalA11y`; foco gestionado en transiciones internas de `GuestSignupPrompt`/`GuestDetailSheet`.
2. **L-3, L-4, L-5, L-6** — Regiones vivas para confirmaciones admin, conteos de filtro, paginación y skeletons.
3. **C-10, C-13** — Semántica de grupo de opciones en modo de ingreso/método de pago; foco y anuncio de paso en el wizard de creación de evento.
4. **B-4** — Convertir `TabButton`/`ScrollableTabs` en un widget de tabs ARIA real.
5. **H-1** — `aria-hidden` global en `Icons.tsx`.
6. **H-2** — Uniformar objetivos táctiles ≥44px, con atención especial a `AdminEventsTable` (separar "Eliminar" de "Ver"/"Reportes").
7. **B-2** — Gestión de foco y anuncio de cambio de ruta.
8. **D-4** — `inert`/`aria-hidden` en el fondo mientras un modal está abierto.
9. **M-1** — Respetar `prefers-reduced-motion` en los 5 puntos de disparo de confetti.

### Fase 3 — Recomendado (pulido, cumplimiento robusto)
1. **A-1 a A-5** — Ajustes de landmarks y headings (Navbar `<nav>`, headings faltantes/duplicados).
2. **F-1, F-3, F-4, G-2, G-3** — Mejoras de tablas y gráficas (caption, scope, agrupación de KPIs, resumen de gráficas).
3. **C-5, C-6, C-7, C-9, C-11, C-12, C-14, C-15, C-16** — Resto de mejoras de formularios (required, autocomplete, fieldset/legend, foco tras error).
4. **E-6/D-7** — `alertdialog` en confirmaciones destructivas.
5. **H-3, H-4, H-5** — `aria-busy`, link de mapa inválido, `alt` redundante en avatares.
6. **L-2, L-7 a L-11** — Resto de regiones vivas de menor tráfico (walk-in, "cargar más", escáner).
7. **R-1** — Evaluar virtualización de listas de invitados si el volumen lo justifica.

---

## 8. Lectores de pantalla — síntomas esperables (síntesis de la sección 15 solicitada)

- **NVDA/JAWS (Windows) navegando por landmarks:** faltará el landmark de navegación principal en escritorio (A-1); no habrá forma de saltar el menú repetido en cada página (B-1).
- **NVDA/JAWS navegando por lista de encabezados (tecla H):** faltarán encabezados en la gráfica del dashboard, en la sección "Hub" de Perfil, y en cada paso del wizard de creación de evento (A-3, A-4, C-13).
- **VoiceOver (iOS/macOS) en modo exploración táctil/rotor:** anunciará "imagen" sin nombre en decenas de iconos decorativos (H-1); no podrá activar la fila de un invitado (D-1) ni abrir el menú de reacciones (D-2) sin un gesto específico que no siempre está disponible.
- **TalkBack (Android):** mismo problema de `GuestRow`/tarjeta de feedback (D-1); al escanear un pase, no se anunciará el nombre del invitado ni el motivo de rechazo, solo el título genérico del resultado (L-8).
- **Cualquier lector de pantalla en formularios de invitado:** anunciará campos sin nombre ("editar texto en blanco") en `GuestEditModal`/`EventJoin`/`GuestEditForm`/`GuestAddForm` (C-1, C-3, C-4); no anunciará errores de validación (C-8); no sabrá que un toast de confirmación apareció (L-1).
- **Cualquier lector de pantalla en el panel admin:** no se enterará de cuántos resultados quedaron tras filtrar (L-4), ni de si una acción masiva tuvo éxito (L-3), ni de que la página de una tabla cambió (L-5).

---

## 9. Pendientes fuera del alcance de esta auditoría de código

- Pruebas manuales con NVDA/JAWS/VoiceOver/TalkBack sobre la app corriendo (esta auditoría predice síntomas a partir del código, no los observó en vivo).
- Verificación de zoom a 200%/400% en cada pantalla dentro de un navegador real.
- Verificación de contraste de texto superpuesto a fotos de portada subidas por organizadores reales (no calculable estáticamente, ver J-6).
- Orden de tabulación visual end-to-end en cada pantalla (revisado por código, no confirmado interactivamente).
- Auditoría de rendimiento de accesibilidad bajo volumen real de datos de producción (R-1).
