# Análisis Competitivo — Módulo de Invitaciones Digitales de PaseLink

**Fecha:** 2026-07-27
**Alcance:** Diseño, experiencia del invitado, información mostrada, componentes UI, funcionalidades, UX y tecnología de 12 plataformas líderes de invitaciones/eventos digitales, comparadas contra el estado real (verificado en código) de PaseLink.

---

## 0. Resumen ejecutivo

PaseLink ya tiene un núcleo **operativo** más sólido que la mayoría de sus competidores directos: check-in por QR con transacciones atómicas, confirmación de pago desde el escáner, permisos granulares de coorganizador, reportes en tiempo real con check-ins por hora, exportación PDF/Excel/CSV, PWA instalable con soporte offline básico, y un muro social con historias tipo Instagram, reacciones y moderación — nada de esto lo tiene, junto, ninguna otra plataforma investigada. Ese es el mayor activo competitivo de PaseLink y el ángulo que **no** hay que diluir.

Donde PaseLink queda atrás no es en profundidad operativa sino en **superficie de producto del lado del invitado**: catálogo de plantillas (7 vs. cientos/miles en WithJoy, Zola, Minted, Canva), campos de información estructurada (sin clima, FAQ, transporte, menú/dietético como campos dedicados — solo texto libre), tipos de pregunta de RSVP (solo texto/número/email/teléfono, sin selección múltiple — el mismo error que documentadamente le cuesta caro a Minted), mensajería masiva a invitados, recordatorios automáticos de RSVP, pasarela de pago real para boletos, y regalo/cash-gift.

También hay una brecha que no viene de la competencia sino de una auditoría interna ya existente (`ACCESSIBILITY_AUDIT.md`, 2026-07-25): **54/100 en accesibilidad WCAG 2.2 AA**, con formularios críticos del invitado (edición de datos, registro, comprobante de pago) sin etiquetas accesibles y dos plantillas (Boda, Kids) que fallan contraste mínimo. Ninguna plataforma competidora tiene evidencia pública de mejor postura, pero PaseLink es la única que tiene el dato medido — ignorarlo sería peor que no saberlo.

La recomendación central de este documento: **no competir en volumen de templates ni en romanticismo visual** (esa carrera la ganan Zola/Minted/Paperless Post con presupuestos de diseño que PaseLink no tiene), sino **profundizar la ventaja operativa + cerrar los huecos de información estructurada del invitado** que son baratos de implementar y tienen alto impacto percibido (FAQ, clima, transporte, dropdown en preguntas custom, regalo vía link, recordatorios).

---

## 1. Metodología y fuentes

- Investigación realizada mediante 4 rondas de búsqueda web activa (sitios oficiales, help centers, reviews de terceros verificables — Capterra, Trustpilot, BBB, App Store/Google Play, prensa tech, comparativas independientes), citando URL por afirmación relevante.
- El estado de PaseLink **no se tomó de memoria ni de suposición**: se verificó leyendo el código fuente actual del repositorio (commit más reciente al 2026-07-24), archivo por archivo, con referencias de path incluidas en la sección 2.
- Donde una fuente no permitió confirmar una funcionalidad, se marca explícitamente como **"no confirmado"** en vez de asumir que existe o no existe. Esto aplica sobre todo a detalles técnicos internos (stacks, soporte offline) que las empresas no publican.
- Plataformas cubiertas: Partiful, Paperless Post, Greenvelope, Evite, Canva, Punchbowl, WithJoy, Zola, Minted, RSVPify, Apple Invites, Invyt (las 12 solicitadas), más un radar de plataformas adicionales detectadas durante la investigación (Poply, InviteDrop, Fotify, 1Invites — sin profundizar).
- Un hallazgo metodológico transversal: **ninguna de las 12 plataformas combina en un solo producto** lo que combina PaseLink (RSVP + QR check-in + pagos + coorganizadores + analytics + muro social + PWA). Cada competidor gana en 1-2 ejes y es débil o inexistente en el resto. Esto se detalla en la sección 4.

---

## 2. Estado actual de PaseLink (línea base verificada en código)

| Área | Estado verificado | Fuente (path) |
|---|---|---|
| Plantillas | 7 temas (`default`, `wedding`, `cowboy`, `graduation`, `formal`, `kids`, `houseparty` — este último solo admin) con paleta, tipografía, radios, sombra y 1 de 4 animaciones de entrada por tema | `src/templates/registry.ts` |
| Personalización | Solo color de acento + imagen de portada por evento; sin edición de fuente/layout | `src/components/EventCreation/steps/StepImageAndColors.tsx` |
| Selector de plantillas | Botones-ícono que se iluminan con el acento del tema + preview en vivo | `src/components/TemplatePicker.tsx`, `TemplateIconButton.tsx` |
| Página del invitado | Portada, QR, countdown, mapa (si hay `mapsUrl`), dress code, agenda/timeline, mensaje de bienvenida, estado de pago, muro (si RSVP=sí) | `src/pages/GuestPass.tsx` |
| Campos **ausentes** en página del invitado | Clima, menú/restricciones alimenticias, registro de regalos, transporte, FAQ dedicada | grep sin resultados en `src/` |
| RSVP | Sí/No/"no estoy seguro"; acompañantes con tope; grupos/familias (`isGroup`); autoedición; autocancelación | `src/firebase/guests.ts`, `GuestEditModal.tsx` |
| Preguntas personalizadas | Solo 4 tipos: texto, número, email, teléfono — **sin selección múltiple/desplegable** | `src/types/index.ts` (`CustomField`) |
| QR / Check-in | Check-in y confirmación de pago **atómicos** vía transacción Firestore; entrada/salida; bloqueo de reingreso; contadores O(1) por hora | `src/firebase/guests.ts` (`checkInGuest`, `confirmPaymentAndCheckIn`) |
| Pagos | `paymentStatus` de 3 estados, reporte de comprobante por texto (no imagen), sin pasarela de pago real — el cobro es manual/informativo | `src/firebase/guests.ts`, `PaymentProofForm.tsx` |
| Muro social | Posts tipados, fotos, historias tipo Instagram con anillo de visto, 6 reacciones, respuestas, moderación con reportes y gating por edad | `src/components/WallSection.tsx`, `StoriesBar.tsx` |
| Compartir | WhatsApp, reenvío de invitación, Web Share API con imagen, enlaces cortos `/e/:id`; deep-link nativo de Instagram Stories **pospuesto** (comentario explícito en código) | `src/utils/share/shareEngine.ts`, `resendInvitation.ts` |
| Calendario / Wallet | `.ics` client-side sí; **Apple/Google Wallet no implementado** (0 referencias en el código) | `src/utils/calendar.ts` |
| Coorganizadores | 12 permisos granulares aditivos, defaults espejados en `firestore.rules` | `src/types/coOrganizerPermissions.ts`, `CoOrganizerPanel.tsx` |
| Reportes | KPIs en vivo, check-ins por hora, exportación CSV/PDF/Excel | `src/pages/Reports.tsx`, `EventAnalytics.tsx` |
| PWA | Instalable, precache selectivo, funciona offline para navegación básica tras la primera visita | `vite.config.ts` |
| Teléfono internacional | Selector de país + normalización con `libphonenumber-js` | `CountryCodeSelect.tsx`, `src/utils/phone.ts` |
| Legal | Checkbox obligatorio de aceptación de Términos/Privacidad en registro | `LegalConsentCheckbox.tsx` |
| Notificaciones | Email de bienvenida, email de pase, email de reporte de contenido al admin — **sin notificación de check-in** (eliminada a propósito), sin push, sin SMS | `src/utils/emailjs.ts` |
| Accesibilidad | **54/100** (WCAG 2.2 AA), casi 0 uso de `aria-live`, formularios críticos sin `label`/`htmlFor`, 2 plantillas fallan contraste (Boda, Kids), sin skip link | `ACCESSIBILITY_AUDIT.md` (no commiteado) |
| Otras funciones confirmadas | Countdown, export PDF/Excel/CSV, reenvío de invitación, multi-dispositivo con LRU, banner de navegador in-app (Instagram/TikTok), reingreso controlado, confeti configurable por tema | Ver detalle en agente de auditoría |
| Funciones eliminadas a propósito | Lista de espera (waitlist) — removida en el rediseño de cobro/reserva de julio 2026 | `src/firebase/events.ts` (comentario explícito) |

---

## 3. Benchmark completo por plataforma

### 3.1 Partiful

**Posicionamiento:** invitación social casual, viral, sin fricción — el "Instagram de las fiestas".

- **Diseño:** fondos animados, GIFs/stickers, sidebars separadas de Theme (fondo) y Effect (animación); video con canal alfa transparente renderizado por GPU; Live Activities de iOS (lockscreen/Dynamic Island). Estética deliberadamente "maximalista-juguetona", a veces "demasiado cute" según reviewers.
- **Guest journey:** cero fricción — link → nombre + teléfono → código SMS → dentro. App Clip de iOS (<50MB) sin instalar la app completa. Tras el RSVP: feed social con comentarios, reacciones, GIFs, fotos; prueba social explícita (ver quién más va).
- **Info mostrada:** fecha/hora/ubicación/descripción libre; dress code, parking, "qué llevar" resueltos como texto libre, no campos estructurados. Sin countdown ni mapa interactivo confirmado.
- **Funcionalidades distintivas:** tipos de RSVP configurables, waitlist automática al llenarse el cupo, aprobación de RSVP, co-hosts, "Text Blasts" masivos, polls de disponibilidad de fecha, pagos vía deep links de Venmo/Cash App/PayPal (no gateway propio), descubrimiento social (eventos de amigos/trending). **Sin QR/check-in propio confirmado** — es invitación social, no gestión operativa del día del evento.
- **Tecnología:** React Native + Expo (Reanimated/Gesture Handler), capas nativas SwiftUI/Kotlin. [swmansion.com/case-studies/partiful]
- **Por qué sobresale:** eliminar cuentas del lado del invitado (solo verificación SMS) reduce el guest journey a segundos, y esa fricción mínima es la base de la viralidad. El feed social convierte cada evento en una mini-red-social efímera.

Fuentes: [swmansion.com/case-studies/partiful](https://swmansion.com/case-studies/partiful/), [help.partiful.com](https://help.partiful.com/), [party.pro/partiful](https://party.pro/partiful/), [en.wikipedia.org/wiki/Partiful](https://en.wikipedia.org/wiki/Partiful)

### 3.2 Paperless Post

**Posicionamiento:** invitación "premium editorial" — diseño de marca de lujo.

- **Diseño:** dos productos (Cards formal con animación de sobre; Flyer casual mobile-first sin sobre). Colaboraciones con Rifle Paper Co., Kate Spade, Oscar de la Renta, Martha Stewart. "Magic Art" (IA generativa de ilustraciones, 2025).
- **Guest journey:** animación insignia de apertura de sobre con nombre escrito — pero con costo de UX medido: ~9s de carga, bloquea acceso simultáneo a RSVP y detalles, degradación en mobile (55% del tráfico).
- **Info mostrada:** sistema de "Blocks" insertables (galería, agenda, registry, direcciones, video); recolecta dirección postal, elección de menú, conteo niños/adultos.
- **Funcionalidades:** mensajería a invitados, calendario, envío por email/texto/link, guest list vía spreadsheet/CRM, check-in vía app dedicada (Plus/Pro), programación de envíos, capacidad máxima con cierre automático.
- **Monetización:** sistema de "Coins" por evento o suscripción Pro (~$250/año) — descrito por terceros como "confuso".
- **Por qué sobresale:** curaduría de diseño de altísimo nivel; separar Cards de Flyer reconoce que el mismo ritual ceremonial que funciona en una boda es fricción en un cumpleaños entre amigos.

Fuentes: [paperlesspost.com/features](https://www.paperlesspost.com/features), [forbes.com — Inside Paperless Post's Evolution](https://www.forbes.com/sites/gabbyshacknai/2026/01/05/inside-paperless-posts-evolution-from-digital-invites-to-cultural-connector/), [lemonvite.com comparativa](https://www.lemonvite.com/blog/greenvelope-vs-paperless-post-vs-lemonvite)

### 3.3 Greenvelope

**Posicionamiento:** invitación "upscale/formal" con la gestión operativa más completa del segmento premium.

- **Diseño:** simulación de sobre físico inusualmente profunda (fieltro, metálico, foil, sellos de cera, bordes die-cut), música que suena al abrir el sobre.
- **Guest journey:** apertura animada con audio; "details panel" que centraliza mapa, registry, hoteles, parking, dress code en un solo lugar sin ensuciar el diseño. Envío multicanal: email, SMS, WhatsApp, Messenger, link.
- **Funcionalidades distintivas:** **app de check-in QR dedicada** (Greenvelope Check-In / EventWorks) con dashboard en tiempo real de % vendido, revenue, checked-in — la única de las tres primeras con gestión día-de-evento confirmada. Seating charts, recordatorios automáticos a no-respondedores, soporta hasta 15,000+ invitados.
- **Precios:** todo incluido sin upcharges por feature (a diferencia del sistema de Coins de Paperless Post), desde $19/20 invitados.
- **Por qué sobresale:** es la única con app de check-in QR + revenue en tiempo real — más cercana en ese eje a lo que ya hace PaseLink.

Fuentes: [greenvelope.com/compare](https://www.greenvelope.com/compare/greenvelope-vs-paperless-post), [support.greenvelope.com — Onsite Check-In](https://support.greenvelope.com/hc/en-us/articles/360023450033-Onsite-Check-In-Summary), [apps.apple.com Greenvelope Check-In](https://apps.apple.com/us/app/greenvelope-check-in/id1005213673)

### 3.4 Evite

**Posicionamiento:** invitación masiva/económica con foco en fotos post-evento.

- **Diseño:** estética "moderna colorida" por categoría de evento; percibida por comparativas como "anticuada" frente a Paperless Post/Punchbowl.
- **Guest journey:** RSVP con mensaje propio, agregar a Maps/calendario. **Photo Share**: álbum colaborativo antes/durante/después del evento, con control de acceso real (requiere RSVP + login o link oficial).
- **Info mostrada:** fecha/hora, dirección con mapa, deadline de RSVP, límite de acompañantes, distinción adultos/niños. Sin countdown, dress code estructurado, agenda o registry nativos confirmados.
- **Funcionalidades:** recordatorios automáticos, mensajería/group chat, tracking en tiempo real. Plan Pro ($249.99/año): hasta 2,500 invitados, analítica de apertura/entrega, branding, co-hosting, video chat.
- **UX — problema documentado:** ads de terceros visibles **en la página de RSVP que ve el invitado** en el plan gratis — degrada la experiencia del invitado, no solo la del host.
- **Por qué sobresale:** Photo Share con control de acceso real es el diferenciador más concreto — convierte la invitación en artefacto que persiste después del evento.

Fuentes: [support.evite.com/photo-share](https://support.evite.com/products/invitations/create-and-edit/photo-share), [Mixily: Evite vs Punchbowl](https://blog.mixily.com/evite-vs-punchbowl/), [Capterra](https://www.capterra.com/p/164166/Evite/reviews/)

### 3.5 Canva

**Posicionamiento:** no es una plataforma de eventos — es una herramienta de diseño gráfico sin RSVP nativo.

- **Hallazgo clave:** Canva **no tiene RSVP ni gestión de lista de invitados nativa**. Un ecosistema de apps de terceros (RSVPify, Invotally, ouRSVP, Pinvite) le agrega esa capa. Existe todo un mercado en Etsy de creadores vendiendo "sitios de invitación interactivos" construidos sobre Canva + terceros — evidencia de demanda real de combinar "mejor diseño" con "función de evento".
- **Diseño:** punto fuertísimo — miles de templates, invitaciones de **video animado** con transiciones, confetti, sincronización de música al beat (Beat Sync, Pro).
- **Accesibilidad:** Canva testea con VoiceOver/NVDA/JAWS, pero **solo en desktop**, no en mobile (limitación documentada por la propia Canva).
- **Por qué sobresale:** calidad de diseño y libertad creativa sin competencia — pero el gap de RSVP/gestión nativa es precisamente el hueco que PaseLink, Evite, Punchbowl y RSVPify cubren.

Fuentes: [urcordiallyinvited.com](https://urcordiallyinvited.com/blogs/news/how-to-add-rsvp-feature-to-your-canva-digital-invitations-a-complete-guide-for-hosts-and-creators), [canva.com/accessibility](https://www.canva.com/accessibility/), [Etsy: Digital Invitation Canva Website](https://www.etsy.com/market/digital_invitation_canva_website)

### 3.6 Punchbowl

**Posicionamiento:** invitación con licencias de personajes (Disney/Marvel/Nickelodeon) para fiestas infantiles.

- **Diseño:** 650+ personajes licenciados (Disney, Marvel, Bluey, PAW Patrol, Sonic, Barbie, Harry Potter, Star Wars) — barrera de entrada legal que ningún otro competidor iguala.
- **Guest journey:** apertura de sobre animada; RSVP de un clic **sin cuenta**; direcciones turn-by-turn, calendario, fotos, polls, potluck list (quién trae qué).
- **UX — problema documentado:** banner ads visibles para el invitado incluso en plan de pago intermedio (Plus); reviews reportan cobros no autorizados y dificultad para cancelar.
- **Precios:** Free (con ads) → Plus ~$7.99/mes (sigue con ads) → Platinum ~$15.99/mes (sin ads) → Business ~$79.99/mes.
- **Por qué sobresale:** RSVP de un clic sin registro + catálogo de personajes con licencia — producto emocional imposible de replicar sin acuerdos de marca.

Fuentes: [TechCrunch 2014](https://techcrunch.com/2014/02/05/punchbowl-rolls-out-new-touch-friendly-digital-cards-snags-exclusive-disney-partnership/), [help.punchbowl.com](https://help.punchbowl.com/), [BBB reviews](https://www.bbb.org/us/ma/framingham/profile/party-planning/punchbowlcom-0021-129838/customer-reviews)

### 3.7 WithJoy

**Posicionamiento:** sitio de boda gratuito con personalización de audiencia por invitado.

- **Diseño:** cientos de templates gratuitos, editor de CSS para usuarios avanzados, sitio de scroll único. Descrito como "pulido" pero "incredibly bulky" en navegación inicial.
- **Guest journey — diferenciador central:** **cada invitado ve una versión distinta del sitio** según a qué eventos fue invitado (ej. la cena de ensayo queda oculta para invitados generales) — resuelve VIP vs. general con visibilidad granular por página, no solo por RSVP.
- **Info mostrada:** agenda multi-evento con zona horaria, dress code y política de celulares por evento, wedding party con biografías, "Booking Assistant" de hospedaje con bloques de hotel, integración Uber/Lyft, registry con cash funds sin comisión.
- **Funcionalidades:** RSVP multi-evento con preguntas de seguimiento, galería colaborativa que se auto-organiza en slideshow en tiempo real durante la recepción. **Sin QR/check-in ni wallet.**
- **UX — problema documentado:** gestión de guest list calificada como "god awful" por usuarios (invitados que desaparecen), solo comunicación por email (sin SMS blast nativo).
- **Por qué sobresale:** la personalización de audiencia por invitado es la decisión de UX más distintiva y directamente aplicable a PaseLink.

Fuentes: [withjoy.com/faq](https://withjoy.com/faq/), [Simpli.com review](https://www.simpli.com/world-events/comprehensive-review-withjoy-com-s-online-rsvp-options-couples), [YourEventKit](https://youreventkit.com/tools/withjoy/)

### 3.8 Zola

**Posicionamiento:** integración vertical (sitio + registry + guest list + notas de agradecimiento) más que diseño individual.

- **Diseño:** 600-1000+ templates categorizados por estética, tipografía jerárquica deliberada (script + serif + sans).
- **Gap documentado por terceros:** Zola **no ofrece invitaciones digitales reales**, solo save-the-dates digitales gratuitos — para invitación hay que comprar papelería física. Terceros (Mixily) explotan activamente este hueco.
- **Info mostrada:** hospedaje con código promocional, "Things to Do" locales, registry nativo (compra sin salir del sitio), notas de agradecimiento automatizadas post-boda.
- **Funcionalidades:** sync automático guest list↔registry, mensajes push de actualizaciones, "group invite" por household — pero con quejas de falta de granularidad (no se puede invitar a un solo miembro de la pareja a un evento específico).
- **Por qué sobresale:** la cohesión de todo el flujo de planificación en un solo dashboard es la propuesta de valor real — valida la tesis de "un solo dashboard de verdad" en vez de features aisladas, que es justamente la fortaleza actual de PaseLink.

Fuentes: [zola.com/wedding-planning/website](https://www.zola.com/wedding-planning/website), [blog.mixily.com/zola-digital-wedding-invitations](https://blog.mixily.com/zola-digital-wedding-invitations/)

### 3.9 Minted

**Posicionamiento:** diseño "boutique" curado por artistas, con UX operativa débil por debajo.

- **Diseño:** 770 templates de artistas independientes, coherencia entre papelería impresa y sitio digital, pero personalización superficial (sin acceso a layout/CSS).
- **Problemas documentados por múltiples fuentes independientes (relevante como advertencia directa):**
  - **No agrupa households correctamente** — pide "party size" numérico, no reconoce miembros como líneas separadas.
  - **Comida como texto libre, no dropdown** → respuestas no normalizadas ("beef", "sirloin", "vegetarian"), sin tally automático para catering.
  - Sin lógica condicional para RSVP multi-evento.
  - Dashboard de edición enterrado (ítem 12 de 13 en el menú).
- **Sin app dedicada de gestión** — dependencia total del navegador.
- **Por qué es relevante para PaseLink:** es el caso de estudio más claro de "diseño bonito, datos de invitados mal modelados" — y PaseLink hoy tiene el mismo problema de fondo en preguntas custom: solo texto/número/email/teléfono, sin selección estructurada (ver sección 6).

Fuentes: [loveandlavender.com/minted-wedding-website-review](https://loveandlavender.com/minted-wedding-website-review/), [topconsumerreviews.com/minted](https://www.topconsumerreviews.com/best-wedding-websites/reviews/minted.php)

### 3.10 RSVPify

**Posicionamiento:** herramienta B2B "spreadsheet-power-user" — profundidad operativa sobre pulido visual.

- **Diseño:** constructor drag-and-drop, cientos de plantillas, pero foco funcional no espectáculo visual.
- **Info y funcionalidades:** seating charts drag-and-drop, tags VIP y segmentación de invitados, eventos privados con links únicos, waitlist automática, **pagos/ticketing vía Stripe** (1.95% + $0.90/ticket), recordatorios automáticos configurables (hasta 2, de 7 días a 1 hora antes), integraciones Zapier/Google Analytics/Outlook.
- **Debilidad documentada:** check-in **sin app dedicada** — se escanea con la cámara del navegador, un reviewer lo marcó como debilidad frente a competidores con app nativa. Sin Wallet, sin "add to calendar" de un clic nativo.
- **Precios:** Free (100 invitados) → Starter $39/mes → Plus $125/mes (incluye check-in) → Professional $409/mes → Enterprise.
- **Por qué sobresale:** profundidad operativa B2B (seating, segmentación, ticketing con pagos reales, multi-sesión) — el mismo territorio operativo donde PaseLink ya es fuerte, pero RSVPify le gana en pagos reales y seating charts, y pierde en experiencia móvil del invitado.

Fuentes: [rsvpify.com/features](https://rsvpify.com/features/), [Capterra RSVPify](https://www.capterra.com/p/176614/RSVPify/reviews/), [SoftwareAdvice](https://www.softwareadvice.com/event-check-in/rsvpify-profile/)

### 3.11 Apple Invites

**Posicionamiento:** integración de ecosistema nativo sin fricción (producto de Apple, lanzado feb. 2025, iPhone-only).

- **Diseño:** interfaz tipo tarjeta con swipe, fondos curados + generación con IA (Image Playground desde v1.8), color scheme automático desde la imagen.
- **Guest journey:** RSVP Sí/No/Tal vez; integraciones nativas de **Maps**, **Weather** (pronóstico que se afina cerca de la fecha), **Apple Music** (playlist colaborativa), **Shared Albums** de Fotos. Desde v1.10 (jul. 2026): reacciones con emoji y confeti al confirmar.
- **Debilidad documentada:** experiencia notablemente peor para invitados sin iPhone, requiere login de Apple ID (fricción), sin app Mac/iPad (criticado públicamente 17 meses después del lanzamiento), tope de 5 personas por respuesta de grupo, sin envío masivo para +80 personas, sin multi-host, sin pagos.
- **Rating:** 4.7/5 en App Store (20K ratings).
- **Por qué sobresale:** menos features que RSVPify o Invyt, pero mejor integradas — un anfitrión con iPhone crea, decora con IA y comparte en minutos dentro de apps que ya usa a diario.

Fuentes: [Apple Newsroom](https://www.apple.com/newsroom/2025/02/introducing-apple-invites-a-new-app-that-brings-people-together/), [MacRumors v1.10](https://www.macrumors.com/2026/07/21/apple-invites-app-two-new-features/), [App Store reviews](https://apps.apple.com/us/app/apple-invites/id6472498645)

### 3.12 Invyt

**Posicionamiento:** invitación web-only sin descarga, con inversión de modelo de creación de lista.

- **Diseño:** marketing propio afirma "7 tipos de reveal + 43 efectos animados" (cifra no verificada independientemente — discrepancia detectada entre marketing y página de producto real).
- **Guest journey — diferenciador central:** **no requiere que el anfitrión arme la lista de invitados de antemano** — son los propios invitados quienes se auto-registran y construyen la lista en tiempo real, eliminando el paso de import/CSV que casi todos los demás (incluido RSVPify) siguen requiriendo.
- **Funcionalidades:** dietary tracking, plus-ones automáticos, **contribuciones de regalo nativas vía Stripe** (única de las 12 en tenerlo confirmado), photo wall, memory book en PDF, broadcast de actualizaciones, QR check-in, workspace corporativo hasta 500+ invitados.
- **Limitación metodológica relevante:** es la única de las 12 sin reviews de usuarios independientes localizadas — toda la narrativa (incluida su tabla comparativa "Invyt gana en todo") viene de marketing propio y debe tratarse con escepticismo proporcional.
- **Por qué sobresale (con la reserva anterior):** invertir el flujo de creación de lista es una idea de producto genuinamente distinta, y combinar en un solo gratuito lo que otros reparten entre herramienta de diseño + red social + suite de gestión.

Fuentes: [invyt.io](https://invyt.io/), [invyt.io/best-invitation-app](https://invyt.io/best-invitation-app) (comparativa propia, sesgada por diseño), [Tracxn — Invyt](https://tracxn.com/d/companies/invyt/__6hYvdRmqDDXkHclxczd9FU5AFHMukctPhAFaTgsXh2o)

### 3.13 Radar — otras plataformas detectadas (no investigadas en profundidad)

- **Poply** — foco en video-invitaciones y app móvil nativa con notificaciones push; free tier limitado a 15 invitados.
- **InviteDrop** — blog/comparador, no queda claro si es también producto propio.
- **Fotify** — apareció en comparativas 2026, sin investigar.
- **1Invites** — posible sitio de contenido/afiliados, no confirmado como producto propio.

---

## 4. Comparativa por plataforma (posicionamiento)

| Plataforma | Fuerte en | Débil en | Perfil |
|---|---|---|---|
| **PaseLink** | Check-in atómico, pagos con confirmación, coorganizadores granulares, reportes, PWA, muro social rico | Catálogo de templates, campos de info estructurada, mensajería masiva, accesibilidad | Suite operativa completa, superficie de invitado incompleta |
| Partiful | Viralidad social, fricción cero, feed de actividad | Check-in/QR, gestión operativa, info estructurada | Invitación social casual |
| Paperless Post | Diseño de marca de lujo, curaduría editorial | Velocidad de carga, UX del RSVP en mobile | Invitación premium formal |
| Greenvelope | Check-in QR + revenue en vivo, simulación de sobre físico | Precio percibido como alto, glitches reportados | Invitación upscale con gestión operativa |
| Evite | Photo Share con control de acceso, volumen/variedad de templates | Ads en la experiencia del invitado gratuito, diseño "anticuado" | Invitación masiva económica |
| Canva | Diseño y creatividad sin límite, video animado | Cero RSVP/gestión nativa | Herramienta de diseño, no de eventos |
| Punchbowl | Personajes con licencia, RSVP de un clic sin cuenta | Ads persistentes incluso en plan de pago | Invitación infantil/licenciada |
| WithJoy | Personalización de audiencia por invitado, 100% gratis | Gestión de guest list, sin QR/check-in | Sitio de boda gratuito |
| Zola | Integración vertical (sitio+registry+guest list) | No tiene invitaciones digitales reales | Suite de planificación de boda |
| Minted | Curaduría de diseño de artista | Modelo de datos de invitados débil (households, dietary) | Diseño boutique, operación floja |
| RSVPify | Ticketing con Stripe real, seating charts, segmentación | Check-in sin app dedicada, UX menos emocional | Herramienta B2B de eventos |
| Apple Invites | Integración de ecosistema (Maps/Weather/Music/Fotos), IA de fondos | iPhone-only, sin pagos, sin envío masivo | Invitación nativa de consumo simple |
| Invyt | Auto-registro de invitados, regalo vía Stripe, todo gratis | Sin validación externa independiente | Invitación todo-en-uno web-only |

**Lectura clave:** PaseLink es la única plataforma de la lista con check-in QR atómico + pagos + coorganizadores + reportes + PWA simultáneamente. La competencia está fragmentada entre "bonitas pero sin gestión" (Canva, Minted, Partiful) y "con gestión pero sin alma" (RSVPify). El espacio abierto es exactamente el que PaseLink ya ocupa — el trabajo es reforzarlo, no abandonarlo por perseguir volumen de templates.

---

## 5. Matriz de funcionalidades

Leyenda: ✅ Sí/confirmado · 🟡 Parcial · 🔴/— No o no confirmado · ❓ No se pudo confirmar con fuente

### 5.1 Diseño y personalización

| | PaseLink | Partiful | Paperless Post | Greenvelope | Evite | Canva | Punchbowl | WithJoy | Zola | Minted | RSVPify | Apple Invites | Invyt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| N.º de templates | 7 | Docenas | Cientos | Docenas | Cientos | Miles | Cientos | Cientos | 600-1000+ | 770 | Cientos | Curados por Apple | ❓ |
| Personalización de color | 🟡 (acento) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (+CSS) | ✅ | 🟡 (superficial) | ✅ | Auto (IA) | ❓ |
| Video/animación de portada | 🔴 | ✅ | 🟡 | ✅ (+audio) | 🟡 | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (afirmado) |
| Generación con IA | 🔴 | 🔴 | ✅ (Magic Art) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (Image Playground) | 🔴 |
| Diseño de marca/licencia | 🔴 | 🔴 | ✅ (Rifle, Kate Spade) | 🔴 | 🔴 | 🔴 | ✅ (Disney/Marvel) | 🔴 | 🔴 | 🟡 (artistas indep.) | 🔴 | 🔴 | 🔴 |

### 5.2 Información del evento mostrada

| | PaseLink | Partiful | Paperless Post | Greenvelope | Evite | Punchbowl | WithJoy | Zola | Minted | RSVPify | Apple Invites | Invyt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Countdown | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ❓ | ❓ | 🔴 | ❓ |
| Clima | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ✅ | 🔴 |
| Mapa embebido | ✅ | ❓ (texto/link) | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ | ❓ | ❓ | ✅ (Maps) | 🔴 |
| Dress code (campo) | ✅ | 🟡 (texto libre) | ❓ | ✅ | 🔴 | 🔴 | ✅ | ✅ | ❓ | 🔴 | 🔴 | 🔴 |
| Agenda/timeline | ✅ | 🔴 | ✅ (Blocks) | ✅ | 🔴 | 🔴 | ✅ (multi-evento) | ✅ | 🟡 | ✅ | 🔴 | 🔴 |
| FAQ dedicada | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ✅ | ✅ | 🔴 | ✅ | 🔴 | 🔴 |
| Registro de regalos | 🔴 | 🔴 (deep link) | ✅ | ✅ | 🔴 | 🟡 | ✅ (cash fund) | ✅ | ❓ | ❓ | 🔴 | ✅ (Stripe) |
| Hospedaje/hoteles | 🔴 | 🔴 | 🔴 | ✅ | 🔴 | 🔴 | ✅ | ✅ | 🔴 | ❓ | 🔴 | 🔴 |
| Transporte | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (Uber/Lyft) | ✅ | 🔴 | ❓ | 🔴 | 🔴 |
| Menú/dietético (estructurado) | 🔴 (solo texto libre) | 🟡 | ✅ | ✅ | 🔴 | 🔴 | ❓ | ✅ | 🟡 (texto libre — bug documentado) | ✅ | 🔴 | ✅ |
| Estacionamiento | 🔴 | 🟡 (texto libre) | 🔴 | ✅ | 🔴 | 🔴 | ✅ | ❓ | 🔴 | ❓ | 🔴 | 🔴 |

### 5.3 RSVP y gestión de invitados

| | PaseLink | Partiful | Paperless Post | Greenvelope | Evite | Punchbowl | WithJoy | Zola | Minted | RSVPify | Apple Invites | Invyt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| RSVP sin cuenta | ✅ (autoregistro) | ✅ (solo SMS) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 (pide Apple ID) | ✅ |
| Plus-ones/acompañantes | ✅ | ✅ | ❓ | ✅ | ✅ | ❓ | ✅ | 🟡 (bugs) | 🟡 (sin nombre, bug) | ✅ | 🟡 (tope 5) | ✅ |
| Grupos/households | ✅ | ❓ | ❓ | ❓ | 🟡 | ❓ | ✅ | 🟡 (poca granularidad) | 🔴 (bug documentado) | ✅ | ❓ | ✅ |
| Preguntas custom — texto | ✅ | ✅ | ✅ | ✅ | 🔴 | ❓ | ✅ | ✅ | ✅ | ✅ | 🔴 | ✅ |
| Preguntas custom — selección/dropdown | 🔴 | ❓ | ❓ | ❓ | 🔴 | ❓ | ❓ | ❓ | 🔴 (bug documentado) | ✅ | 🔴 | ❓ |
| Segmentación/tags VIP | 🔴 | 🔴 | ✅ (Plus/Pro) | ❓ | 🔴 | 🔴 | ❓ | 🔴 | 🔴 | ✅ | 🔴 | 🔴 |
| Autoedición del invitado | ✅ | ❓ | ❓ | ❓ | 🟡 (host edita) | ❓ | 🔴 (difícil, según reviews) | ❓ | ❓ | ❓ | 🟡 | ❓ |
| Waitlist | 🔴 (removida a propósito) | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | 🔴 | ❓ |

### 5.4 Pagos, check-in y operación del día del evento

| | PaseLink | Partiful | Paperless Post | Greenvelope | Evite | Punchbowl | WithJoy | Zola | Minted | RSVPify | Apple Invites | Invyt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Pasarela de pago real (Stripe/similar) | 🔴 (manual/informativo) | 🔴 (deep links) | ❓ | ✅ (revenue tracking) | ❓ | ❓ | 🔴 | 🔴 (solo registry) | 🔴 | ✅ | 🔴 | ✅ |
| QR de invitado | ✅ | 🔴 | ❓ | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (cámara navegador) | 🔴 | ✅ |
| App dedicada de check-in | ✅ (Scanner web, PWA) | 🔴 | ✅ | ✅ (nativa) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 (sin app) | 🔴 | ❓ |
| Check-in atómico con gate de pago | ✅ | 🔴 | ❓ | ❓ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ❓ | 🔴 | ❓ |
| Reportes/analytics en vivo | ✅ (checkins por hora) | 🔴 | ✅ (opens/RSVP, Pro) | ✅ (revenue en vivo) | ✅ (Pro) | ✅ | 🔴 | 🔴 | 🔴 | ✅ | 🔴 | ✅ (dashboard) |
| Seating chart | 🔴 | 🔴 | 🔴 | ✅ | 🔴 | 🔴 | 🔴 | ❓ | 🔴 | ✅ | 🔴 | 🔴 |
| Coorganizadores con permisos granulares | ✅ (12 permisos) | 🟡 (co-host simple) | 🟡 | 🟡 | 🟡 | 🟡 | 🟡 | 🔴 | 🔴 | ❓ | 🔴 (single host) | ❓ |

### 5.5 Compartir, calendario y notificaciones

| | PaseLink | Partiful | Paperless Post | Greenvelope | Evite | Punchbowl | WithJoy | Zola | Minted | RSVPify | Apple Invites | Invyt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| WhatsApp | ✅ | ❓ | 🔴 | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ❓ |
| SMS | 🔴 | ✅ | ✅ (US/CA) | ✅ | ❓ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (iMessage) | ❓ |
| Email | ✅ | 🔴 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (Mail) | ✅ |
| Agregar a calendario | ✅ (.ics) | ✅ | ✅ | ✅ | ✅ | ✅ | ❓ | ❓ | ❓ | 🟡 (vía Zapier) | ✅ (nativo) | ❓ |
| Apple/Google Wallet | 🔴 (descartado por costo) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Recordatorios automáticos de RSVP | 🔴 | ❓ | ❓ | ✅ | ✅ | ❓ | ❓ | ✅ | ❓ | ✅ | 🔴 | ❓ |
| Mensajería masiva al invitado | 🔴 (solo individual) | ✅ (Text Blasts) | ✅ | ✅ | ✅ | ❓ | 🔴 | ✅ | 🔴 | ❓ | 🔴 | ✅ (broadcast) |
| Push notifications | 🔴 | ✅ | ❓ | ❓ | ❓ | ❓ | ❓ | ✅ | ❓ | ❓ | ✅ | ❓ |

### 5.6 Social / post-evento

| | PaseLink | Partiful | Paperless Post | Greenvelope | Evite | Punchbowl | WithJoy | Zola | Minted | RSVPify | Apple Invites | Invyt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Álbum/muro de fotos | ✅ (con historias) | ✅ (feed) | 🔴 | 🔴 | ✅ (Photo Share) | ✅ | ✅ (auto-slideshow) | 🔴 | 🔴 | 🔴 | ✅ (Shared Album) | ✅ |
| Reacciones/comentarios | ✅ (6 tipos + respuestas) | ✅ | 🔴 | 🔴 | 🔴 | ✅ (comentarios) | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (emoji, v1.10) | 🔴 |
| Moderación de contenido | ✅ (reportes + gating por edad) | ❓ | — | — | ❓ | ❓ | ❓ | — | — | — | ❓ | ❓ |
| Memory book / recap descargable | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ✅ (PDF) |

### 5.7 Tecnología

| | PaseLink | Partiful | Paperless Post | Greenvelope | Evite | Canva | Punchbowl | WithJoy | Zola | Minted | RSVPify | Apple Invites | Invyt |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| PWA instalable | ✅ | 🔴 (App Clip en su lugar) | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | 🔴 (app nativa) | ❓ |
| Soporte offline | ✅ (navegación básica) | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ | 🟡 (marketing, sin detalle) | ❓ | ❓ | ❓ | 🔴 | ❓ |
| App nativa | 🔴 (solo PWA) | ✅ | ✅ (solo check-in) | ✅ (solo check-in) | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 | ✅ | 🔴 |
| Accesibilidad medida/documentada | ✅ (54/100, auditoría propia) | ❓ | ❓ | ❓ | ❓ | 🟡 (desktop only) | ❓ | ❓ | ❓ | ❓ | ❓ | ❓ |

---

## 6. Gap Analysis

### ✅ Ya existe en PaseLink (y está a la par o por delante del mercado)

| Funcionalidad | Nota comparativa |
|---|---|
| Check-in QR con transacción atómica + gate de pago | Solo Greenvelope tiene algo comparable (app dedicada); RSVPify no tiene app de check-in dedicada |
| Confirmación de pago desde el escáner | No confirmado en ninguna otra plataforma investigada |
| Coorganizadores con 12 permisos granulares | Todos los competidores con "co-host" son binarios (todo o nada) |
| Reportes con check-ins por hora + export PDF/Excel/CSV | Comparable solo a RSVPify (Enterprise) y Greenvelope |
| Muro social con historias, reacciones y moderación por edad | Más rico que el Activity Feed de Partiful (que no modera por edad) y que el Photo Share de Evite (que no tiene reacciones) |
| PWA instalable con soporte offline | Ninguna otra plataforma investigada lo confirma — la mayoría son app nativa o web pura |
| Selector de país + normalización de teléfono (libphonenumber) | No confirmado en ninguna otra plataforma — relevante para expansión LatAm |
| Autoedición y autocancelación de asistencia | WithJoy lo tiene difícil según reviews; ninguna otra lo confirma con la fluidez de PaseLink |
| Multi-dispositivo con reconocimiento de pase (LRU) | No encontrado en ninguna plataforma investigada — diferenciador real |
| Ad-free para el invitado | Evite y Punchbowl exponen ads incluso en planes de pago intermedios — PaseLink nunca lo hace |

### 🟡 Existe pero puede mejorarse

| Funcionalidad | Qué falta / por qué mejorar | Referencia competitiva |
|---|---|---|
| Catálogo de plantillas (7) | Personalización limitada a color de acento + portada; sin selector de fuente/layout | WithJoy/Zola/Minted ofrecen cientos, con tipografía y paleta editables por el usuario |
| Preguntas personalizadas del RSVP (solo texto/número/email/teléfono) | Sin tipo "selección/dropdown" — mismo error documentado que le genera datos sucios a Minted (comida como texto libre no normalizable para catering) | RSVPify sí soporta lógica y opciones estructuradas |
| Pago de entrada (manual + comprobante por texto) | Sin pasarela real; el comprobante es texto, no imagen adjunta — más lento de auditar que un cobro con Stripe/Mercado Pago | RSVPify e Invyt cobran directo con Stripe; Greenvelope trackea revenue en vivo |
| Compartir por Instagram Stories | Deep-link nativo pospuesto (comentario explícito en código) — hoy es un botón genérico | Ninguna plataforma competidora lo tiene tampoco, pero es una promesa a medio implementar dentro del propio código |
| Notificaciones al invitado | Solo email transaccional (bienvenida, pase) — sin recordatorio de RSVP pendiente ni push | Greenvelope, Evite, RSVPify, Zola tienen recordatorios automáticos; el límite del free tier de EmailJS (2 templates) es una restricción técnica real a resolver |
| Accesibilidad (54/100) | Formularios críticos del invitado sin `label`/`htmlFor`, casi 0 `aria-live`, 2 plantillas fallan contraste AA | Sin dato comparable de competidores, pero es el hallazgo más accionable porque ya está medido internamente |

### 🔴 Hace falta implementarlo

| Funcionalidad | Valor que aporta | Prioridad sugerida |
|---|---|---|
| Campo de clima en la página del invitado | Reduce incertidumbre logística (qué llevar, si el evento es al aire libre); Apple Invites lo usa como uno de sus 4 pilares de producto | Alta / esfuerzo bajo (API gratuita tipo Open-Meteo) |
| Sección FAQ dedicada | Reduce mensajes repetitivos al organizador (parking, niños, dress code); WithJoy, Zola y RSVPify la tienen | Alta / esfuerzo bajo |
| Campos estructurados de transporte y estacionamiento | Elimina uso de "descripción" como cajón de sastre; WithJoy y Greenvelope la tienen | Media / esfuerzo bajo |
| Tipo de pregunta "selección/dropdown" en `CustomField` | Evita el error documentado de Minted (datos de comida no normalizables); habilita menú/restricciones alimenticias estructuradas | Alta / esfuerzo medio |
| Link de regalo/cash-gift (Mercado Pago/PayPal.me) | Monetiza baby showers y cumpleaños sin construir un registry completo; Partiful lo resuelve con deep links simples | Media / esfuerzo bajo |
| Mensajería masiva a segmentos de invitados (ej. "quienes no respondieron") | Reduce trabajo manual del organizador; lo tienen Partiful, Paperless Post, Greenvelope, Zola, Invyt | Alta / esfuerzo medio |
| Recordatorio automático de RSVP pendiente | Sube la tasa de respuesta; estándar en Greenvelope, Evite, RSVPify, Zola | Alta / esfuerzo medio (atado a resolver límite de EmailJS) |
| Pasarela de pago real (Mercado Pago/Stripe) para entradas | Reemplaza el flujo manual de comprobante por texto; es el gap más grande frente a RSVPify/Invyt/Greenvelope | Alta / esfuerzo alto |
| Seating chart simple para eventos corporativos/gala | RSVPify y Zola lo ofrecen; útil para el segmento de eventos corporativos que PaseLink ya cubre (a diferencia de Zola/Minted/WithJoy, mono-boda) | Media / esfuerzo alto |
| Remediación de accesibilidad (labels, aria-live, contraste) | Ya documentado y medido en `ACCESSIBILITY_AUDIT.md` — es deuda conocida, no una apuesta | Alta / esfuerzo medio |
| Push notifications vía service worker | La PWA ya está instalable — falta aprovechar ese canal en vez de depender solo de email | Media / esfuerzo medio |

### ⚫ No vale la pena implementarlo (por ahora)

| Funcionalidad | Por qué no |
|---|---|
| Apple Wallet | Ya evaluado y descartado por costo de Apple Developer Program ($99/año) — decisión ya tomada, no hay información nueva que la revierta |
| Lista de espera (waitlist) automática | Fue **removida a propósito** en el rediseño de cobro/reserva de julio 2026 — reintroducirla contradice una decisión de producto reciente y deliberada |
| Registry/marketplace de regalos completo (tipo Zola) | Requiere integración de e-commerce con terceros (Target, Crate & Barrel), logística de envío y soporte — desproporcionado frente al valor; el link simple de cash-gift (🔴 arriba) cubre el 80% del caso de uso real |
| Catálogo de personajes con licencia (tipo Punchbowl) | Costo de licenciamiento y riesgo legal desproporcionados para el tamaño actual de PaseLink; no es coherente con el posicionamiento de suite operativa |
| App Clip nativo de iOS (tipo Partiful) | Requiere inversión de desarrollo nativo iOS dedicado; la PWA ya cubre gran parte del mismo objetivo (acceso instantáneo sin fricción) a menor costo de mantenimiento |
| Editor de CSS libre para el organizador (tipo WithJoy) | Alto riesgo de romper la coherencia visual y la accesibilidad recién auditada; el selector de plantillas con acento de color ya resuelve personalización sin ese riesgo |
| Potluck list / "quién trae qué" (tipo Punchbowl) | Feature de nicho (fiestas caseras informales) que no encaja con el perfil de eventos con cobro/control de acceso que ya sirve PaseLink |
| Polls de disponibilidad de fecha pre-evento (tipo Partiful) | Resuelve un problema *antes* de que exista el evento en PaseLink — fuera del alcance actual del producto (crear evento ya asume fecha definida); posible idea futura, no gap actual |

---

## 7. Oportunidades detectadas

1. **La accesibilidad es, hoy, la ventaja competitiva más barata de construir.** Ninguna plataforma investigada publica una medición de accesibilidad — PaseLink ya la tiene (54/100) y sabe exactamente qué arreglar. Cerrar esa brecha no solo es lo correcto, es diferenciador comprobable ("la única invitación digital que se testeó con lectores de pantalla").

2. **El error de Minted (datos de invitados mal modelados) es una advertencia directa, no una curiosidad ajena.** El `CustomField` de PaseLink hoy tiene la misma limitación estructural (solo texto libre) que le genera a Minted datos de catering inutilizables. Agregar un tipo `select` es esfuerzo bajo y cierra ese riesgo antes de que se vuelva un problema real de PaseLink con eventos grandes.

3. **PaseLink ya ganó la pelea de "gestión operativa completa"; nadie la está peleando en serio.** Greenvelope y RSVPify son los únicos rivales reales en ese eje, y ambos tienen huecos (Greenvelope: sin gate de pago atómico confirmado; RSVPify: check-in sin app dedicada). Consolidar ahí es más defendible que perseguir el volumen de templates de Zola/Minted.

4. **El límite de 2 templates del free tier de EmailJS (ver memoria de proyecto) bloquea directamente la implementación de recordatorios automáticos**, que es uno de los gaps 🔴 de mayor impacto. Resolver esto (upgrade de plan o migrar a un proveedor con más templates) es un prerrequisito técnico, no solo una decisión de producto.

5. **El caso WithJoy (visibilidad de página por invitado) es aplicable sin rediseño mayor**: PaseLink ya tiene coorganizadores con permisos granulares y `isGroup`; extender ese modelo a "qué secciones ve cada invitado" (ej. ocultar info de after-party a invitados generales) es una extensión natural del modelo de datos existente, no una funcionalidad nueva desde cero.

6. **El "detail panel" de Greenvelope (mapa+registry+hoteles+parking+dress code en un solo lugar sin ensuciar el diseño)** es un patrón de UI directamente portable a `GuestPass.tsx`: agrupar los nuevos campos (FAQ, clima, transporte) en una sección expandible en vez de alargar la página lineal, evitando el problema de "página bulky" que reviews le critican a WithJoy.

---

## 8. Ideas nuevas (ventajas competitivas originales)

No limitadas a lo que ya hace la competencia — ideas propias apoyadas en fortalezas que PaseLink ya tiene y ningún competidor investigado combina.

### 8.1 Pantalla "Anfitrión en vivo"

- **Problema que resuelve:** en el evento, el organizador no tiene forma de mostrar en una pantalla/TV/proyector el pulso del check-in en tiempo real — algo natural para bodas, fiestas y eventos corporativos con recepción.
- **Usuarios beneficiados:** organizadores y coorganizadores en el momento del evento; también genera ambiente para los invitados (ver su nombre/confeti al entrar).
- **Cómo funcionaría:** una ruta pública de solo lectura (sin datos sensibles) que muestra check-ins recientes con animación de confeti, contador de asistentes dentro, y próximo hito de capacidad — reutiliza el mismo store en tiempo real que ya alimenta `Reports.tsx` y `EventAnalytics.tsx`.
- **Complejidad:** media — no requiere nuevo modelo de datos, solo una vista nueva sobre datos existentes con throttling de Firestore ya resuelto (el muro ya maneja ese patrón).
- **Impacto esperado:** alto en percepción de "evento premium" con esfuerzo bajo-medio, y no lo tiene ningún competidor investigado.

### 8.2 Visibilidad de secciones por tipo de invitado

- **Problema que resuelve:** hoy todos los invitados ven la misma página; no hay forma de ocultar, por ejemplo, la info del after-party a invitados generales o mostrar una agenda distinta a la mesa de honor — el problema que WithJoy resuelve pero solo para bodas.
- **Usuarios beneficiados:** organizadores de eventos con audiencias mixtas (bodas con cena de ensayo, eventos corporativos con sesión VIP, cumpleaños con after).
- **Cómo funcionaría:** extender el modelo de permisos existente (`coOrganizerPermissions` ya es aditivo y por evento) a un concepto paralelo de "audiencia de invitado" (`guest.tier` general/VIP), y condicionar el render de secciones en `GuestPass.tsx` igual que ya se hace con el muro (`rsvpStatus === 'yes'`).
- **Complejidad:** media — el patrón de "renderizar condicionalmente por atributo del invitado" ya existe en el código.
- **Impacto esperado:** alto para el segmento de bodas/corporativo, sin canibalizar la simplicidad para eventos chicos (el campo es opcional).

### 8.3 CRM ligero de invitados recurrentes

- **Problema que resuelve:** un organizador que hace eventos seguidos (ej. un salón de fiestas, un promotor) hoy no tiene forma de reconocer que "Juan" ya asistió a 3 eventos anteriores — cada evento es una isla de datos.
- **Usuarios beneficiados:** organizadores recurrentes/profesionales (el segmento con mayor LTV para PaseLink).
- **Cómo funcionaría:** aprovechar que ya existe `claimGuestOwnership()` y `users/{uid}/invitations` (usado hoy para "Mis invitaciones" del lado del invitado) para construir la vista espejo del lado del organizador: "este invitado ya fue a 2 eventos tuyos", con opción de reimportarlo a un evento nuevo con un clic.
- **Complejidad:** media-alta — requiere un índice/agregación nueva pero reutiliza infraestructura de vinculación de cuenta ya construida.
- **Impacto esperado:** alto valor comercial (retención de organizadores profesionales), diferenciador que ninguna plataforma investigada ofrece (todas tratan cada evento como aislado).

### 8.4 Recordatorio inteligente de salida ("hora de salir")

- **Problema que resuelve:** el invitado sabe la hora del evento pero no cuándo salir de su casa considerando tráfico/clima — un problema real que ninguna plataforma resuelve hoy (Apple Invites muestra clima pero no lo conecta con la logística de salida).
- **Usuarios beneficiados:** invitados, especialmente en eventos con ubicación lejana o mal señalizada.
- **Cómo funcionaría:** notificación push (una vez implementado el canal de 8.x / gap 🔴) la mañana del evento con clima + estimación de viaje desde la última ubicación conocida (con consentimiento explícito) usando una API de mapas gratuita — combina dos gaps 🔴 (clima + push) en una sola funcionalidad con más impacto que la suma de las partes.
- **Complejidad:** alta (requiere permisos de ubicación, push, y las dos integraciones base primero).
- **Impacto esperado:** medio-alto, mejor pensarlo como fase 4 una vez resueltos los prerrequisitos.

### 8.5 Plantillas comunitarias curadas

- **Problema que resuelve:** el catálogo de 7 plantillas es la brecha más visible frente a competidores con cientos — pero diseñar cientos de plantillas propias no es viable con el equipo actual de PaseLink.
- **Usuarios beneficiados:** organizadores que quieren variedad; indirectamente, diseñadores freelance que quieren visibilidad.
- **Cómo funcionaría:** en vez de un marketplace abierto (alto riesgo de moderación/calidad), un proceso curado donde PaseLink invita a 2-3 diseñadores a proponer temas nuevos por trimestre, siguiendo el mismo contrato de datos que ya define `registry.ts` (accent/pageBg/surface/fontFamily/enterAnimation) — bajo el mismo control de calidad y accesibilidad que hoy aplica a los 7 temas existentes.
- **Complejidad:** baja en código (el sistema de temas ya es extensible por diseño), media en proceso (curaduría, no ingeniería).
- **Impacto esperado:** alto — ataca directamente la brecha más visible (5.1) sin comprometer coherencia ni accesibilidad, a diferencia de abrir edición de CSS libre (descartada en la sección 6).

---

## 9. Priorización — Impacto vs. Esfuerzo

| Funcionalidad | Impacto usuario | Complejidad técnica | Esfuerzo | Valor comercial | Diferenciación |
|---|:-:|:-:|:-:|:-:|:-:|
| Tipo de pregunta "selección/dropdown" | Alto | Baja | Bajo | Medio | Bajo (pero evita deuda de datos) |
| Campo de clima | Medio | Baja | Bajo | Bajo | Medio (nadie más lo tiene salvo Apple) |
| Sección FAQ dedicada | Alto | Baja | Bajo | Medio | Bajo |
| Campos de transporte/estacionamiento | Medio | Baja | Bajo | Bajo | Bajo |
| Link de regalo/cash-gift | Medio | Baja | Bajo | Medio | Medio |
| Remediación de accesibilidad (críticos) | Alto | Media | Medio | Medio | Alto |
| Mensajería masiva segmentada | Alto | Media | Medio | Alto | Medio |
| Recordatorio automático de RSVP | Alto | Media | Medio | Alto | Medio |
| Push notifications (PWA) | Medio | Media | Medio | Medio | Medio |
| Visibilidad de secciones por tipo de invitado | Alto | Media | Medio | Alto | Alto |
| Plantillas comunitarias curadas | Alto | Baja (código) / Media (proceso) | Medio | Alto | Medio |
| Pasarela de pago real (Mercado Pago/Stripe) | Alto | Alta | Alto | Muy alto | Alto |
| Seating chart | Medio | Alta | Alto | Medio | Medio |
| Pantalla "Anfitrión en vivo" | Alto | Media | Medio | Medio | Alto |
| CRM ligero de invitados recurrentes | Alto | Alta | Alto | Alto | Alto |
| Recordatorio inteligente de salida | Medio | Alta | Alto | Bajo | Alto |

**Cuadrantes:**
- **Alto impacto / bajo esfuerzo (hacer primero):** dropdown en custom fields, FAQ, clima, transporte/parking, cash-gift.
- **Alto impacto / esfuerzo medio (siguiente):** accesibilidad crítica, mensajería masiva, recordatorios de RSVP, visibilidad por tipo de invitado, plantillas comunitarias.
- **Alto impacto / esfuerzo alto (apostar con calma):** pasarela de pago real, CRM de invitados recurrentes.
- **Impacto medio / esfuerzo alto (evaluar caso a caso, no urgente):** seating chart, recordatorio inteligente de salida.

---

## 10. Roadmap

### Fase 1 — Quick wins (1-2 días cada uno)

- Agregar tipo `select` (opciones predefinidas) a `CustomField` en `src/types/index.ts` y su UI en `CustomFieldsBuilder`.
- Campo estructurado de transporte/estacionamiento en el modelo de evento + render condicional en `GuestPass.tsx`.
- Campo de clima: integrar una API gratuita (ej. Open-Meteo, sin costo ni API key) mostrando pronóstico si la fecha está dentro del rango de forecast.
- Sección FAQ dedicada (lista de preguntas/respuestas configurable por el organizador, reutilizando el patrón de acordeón que ya usan los pasos del wizard).
- Campo de link de regalo/cash-gift (Mercado Pago/PayPal.me como texto de link, sin integración de API) visible junto al RSVP.
- Completar el deep-link nativo de Instagram Stories que ya está diseñado pero pospuesto en `shareEngine.ts`.

### Fase 2 — Mejoras importantes (1-3 semanas)

- Remediación de accesibilidad crítica priorizada por el propio `ACCESSIBILITY_AUDIT.md`: labels/`htmlFor` en formularios del invitado, `aria-live` en toasts/resultados de escáner, fix de contraste en plantillas Boda y Kids.
- Mensajería masiva segmentada (ej. "reenviar a quienes no respondieron") reutilizando la infraestructura de WhatsApp/email ya construida para reenvío individual.
- Recordatorio automático de RSVP pendiente — condicionado a resolver el límite de 2 templates del free tier de EmailJS (evaluar upgrade de plan o proveedor alternativo).
- Push notifications vía service worker, aprovechando que la PWA ya está instalable.
- Visibilidad de secciones por tipo de invitado (extensión del modelo de permisos existente a nivel invitado, no solo coorganizador).
- 2-3 plantillas nuevas vía el proceso curado descrito en la sección 8.5, como primer paso hacia un catálogo más amplio sin comprometer coherencia visual.

### Fase 3 — Grandes funcionalidades

- Pasarela de pago real (Mercado Pago, por relevancia regional, o Stripe) para reemplazar el flujo manual de comprobante por texto, manteniendo el flujo manual como fallback para organizadores que prefieran efectivo/transferencia.
- Seating chart simple para el segmento de eventos corporativos/gala que PaseLink ya sirve (a diferencia de competidores mono-boda).
- Pantalla "Anfitrión en vivo" (sección 8.1).
- CRM ligero de invitados recurrentes (sección 8.3), priorizado si el segmento de organizadores profesionales/recurrentes resulta ser el de mayor retención.

### Fase 4 — Diferenciadoras de mercado

- Recordatorio inteligente de salida combinando clima + estimación de viaje (sección 8.4), una vez resueltos los prerrequisitos de push y clima.
- Evaluar generación con IA de fondos/portadas (al estilo Magic Art de Paperless Post o Image Playground de Apple) como capa opcional sobre el sistema de temas existente, solo si el costo de API por evento es sostenible con el modelo de precios de PaseLink.
- Marketplace curado de plantillas comunitarias a mayor escala, si la fase 2 valida demanda.
- Multi-idioma si PaseLink evalúa expansión fuera de mercados hispanohablantes.

---

## 11. Conclusiones

PaseLink no necesita reinventarse para competir — necesita **dejar de subestimar lo que ya construyó**. La combinación de check-in atómico con gate de pago, coorganizadores granulares, reportes en tiempo real, muro social moderado y PWA offline no la tiene, junta, ninguna de las 12 plataformas investigadas en profundidad. Esa es la base sobre la que construir, no un punto de partida a abandonar por perseguir el catálogo de templates de Zola o el glamour de Paperless Post.

Los gaps reales y accionables son, en su mayoría, **baratos**: un tipo de campo nuevo, una sección de FAQ, un widget de clima gratuito, un link de regalo. El gap más caro (pasarela de pago real) es también el de mayor valor comercial, y vale la pena secuenciarlo después de cerrar los quick wins que generan confianza y datos de uso.

La accesibilidad merece mención aparte: es el único eje donde PaseLink tiene una medición propia y ningún competidor tiene una pública. Convertir ese 54/100 en una fortaleza documentada, en vez de dejarlo como un archivo sin commitear, es probablemente la decisión de mayor retorno por hora invertida de todo este análisis.

Finalmente, las ideas originales de la sección 8 —visibilidad por tipo de invitado, pantalla de anfitrión en vivo, CRM de invitados recurrentes— comparten un patrón: todas reutilizan infraestructura que PaseLink ya construyó para otro propósito. Ese es, en última instancia, el argumento más fuerte de este documento: la ventaja competitiva de PaseLink no está en lo que falta construir desde cero, sino en lo que ya existe y todavía no se terminó de explotar.
