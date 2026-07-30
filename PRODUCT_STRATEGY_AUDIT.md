# Auditoría de producto — PaseLink

**Rol asumido:** Head of Product / CPO evaluando si PaseLink tiene potencial de convertirse en el mejor producto de su categoría.
**Fecha:** 2026-07-30.
**Alcance:** producto, no código ni UI. Las limitaciones técnicas actuales se ignoran deliberadamente cuando corresponde — lo que importa es si las decisiones de producto son correctas, no si son fáciles de implementar hoy.
**Base factual:** inventario de código y de los 4 documentos estratégicos ya existentes en el repo (`ACCESSIBILITY_AUDIT.md`, `INVITATION_COMPETITIVE_ANALYSIS.md`, `PLATFORM_EXPANSION_ARCHITECTURE.md`, `INNOVATION_FEATURES_V1.md`). Cuando una afirmación depende de un hecho verificado en código, se cita la fuente.

Este documento es deliberadamente incómodo en partes. Ese es el objetivo.

---

## 1. Propuesta de valor

**¿Está clara? No.**

El README define PaseLink como una herramienta para "gestionar invitaciones, listas de invitados y control de acceso a eventos mediante códigos QR" que reemplaza listas en papel o planillas sueltas. Esa es una propuesta de valor operativa, correcta y honesta — pero es la propuesta de valor de un producto que ya no existe. El PaseLink que hoy vive en el código incluye muro social con historias y reacciones, clima, recordatorio inteligente de salida, seating chart, panel "Anfitrión en Vivo", plantillas comunitarias con moderación editorial, menú y dietas estructuradas, registro de regalos, FAQ, transporte y estacionamiento. Ninguna de esas funciones aparece en la frase que el producto usa para presentarse.

**¿Se entiende en menos de 30 segundos?** No. Para entender qué es PaseLink hoy hace falta leer una lista de quince capacidades distintas. Eso no es una propuesta de valor, es un changelog. Un producto con propuesta de valor clara se explica con una frase que además funciona como filtro: le dice a la mitad de la audiencia potencial "esto no es para vos" tan rápido como le dice a la otra mitad "esto es exactamente para vos". PaseLink hoy no filtra a nadie, y por lo tanto no le habla con fuerza a nadie.

**¿Qué problema resuelve realmente?** Bien mirado, uno solo, y lo resuelve muy bien: controlar quién entra a un evento, en tiempo real, sin depender de una persona con un cuaderno en la puerta, cuando hay cupo, dinero o seguridad de por medio. Ese es el núcleo técnico más sólido del producto (transacciones atómicas de check-in, funcionamiento offline vía PWA, confirmación de pago integrada al escaneo, permisos granulares de quién puede hacer qué en la puerta). Todo lo demás — muro social, clima, plantillas, seating — es decoración alrededor de ese núcleo, construida porque era técnicamente posible, no porque resolviera el problema central con más fuerza.

**¿Qué promesa hace PaseLink?** Ninguna, en el sentido de marketing. No hay una frase tipo "nunca más una lista en la puerta" o "tu evento, bajo control total, en tiempo real". Hay una descripción de funciones. Una promesa es emocional y verificable ("vas a sentir X, y vas a poder comprobar Y"); una lista de funciones no genera decisión de compra ni de adopción, genera curiosidad tibia.

**¿Qué tan diferenciada está frente a la competencia?** Aquí está la paradoja central de esta auditoría: PaseLink tiene, en su capa operativa (check-in atómico + pago confirmado desde el escáner + permisos granulares de staff + reportes en vivo + PWA offline), una combinación que **ninguna de las 12 plataformas analizadas en `INVITATION_COMPETITIVE_ANALYSIS.md` tiene junta**. Partiful y Apple Invites no tienen check-in real. Eventbrite tiene check-in pero es pesado, corporativo, y su pago es la única razón de ser del producto (no un añadido). PaseLink literalmente ya construyó la diferenciación que necesita — pero no la comunica como diferenciación, la comunica como una función más entre veinte, y encima la construyó al servicio del caso de uso equivocado (ver sección 2).

**Veredicto:** la propuesta de valor no es débil por falta de sustancia — es débil porque el producto no sabe cuál de sus fortalezas es la que importa, y las presenta todas con el mismo peso.

---

## 2. Público objetivo

"Cumpleaños, bodas, graduaciones, fiestas privadas, eventos escolares, eventos corporativos pequeños, y cualquier evento donde exista una lista de invitados" no es un público objetivo. Es la ausencia de uno. Es la respuesta que da un producto que todavía no decidió a quién decepcionar.

**¿Está demasiado amplio? Sí, de forma flagrante.** Una boda y una discoteca privada con cobro en puerta no comparten casi ningún criterio de decisión de compra: la novia busca belleza, storytelling, un sitio web memorable, integración con registro de regalos — no le importa el control de cupo en tiempo real porque nadie escanea un QR para entrar a una boda. El organizador de una fiesta privada con cobro sí necesita exactamente eso: saber quién pagó, bloquear el reingreso, controlar el cupo en vivo, dar acceso de escaneo a tres empleados de seguridad sin darles acceso a editar el evento. Construir un único producto que satisfaga a ambos obliga a diluir lo que hace bien por el segundo grupo para no asustar al primero, y a la vez a no invertir lo suficiente en diseño/storytelling para competir de verdad por el primero.

**¿Quién obtiene más valor?** El organizador que tiene una razón operativa real para controlar el acceso: hay dinero de por medio, hay cupo limitado y hay riesgo si entra gente de más, o hay staff que necesita permisos diferenciados. Eso describe bien a: fiestas privadas con cobro, eventos corporativos con control de acceso/seguridad, quinceañeras y eventos grandes con seguridad contratada, festivales o eventos privados de mediana escala. Es exactamente el segmento donde el núcleo técnico de PaseLink (check-in atómico + pago + permisos) es un diferenciador real y no una curiosidad.

**¿Quién obtiene poco valor?** El cumpleaños casual de 15 amigos coordinado por WhatsApp (Partiful gana con fricción cero y estética superior) y la boda tradicional (Zola/WithJoy/Joy ganan porque son productos especializados de punta a punta para un evento que ocurre una vez en la vida, con estándares de diseño que un catálogo de 7 plantillas genéricas no puede igualar). Nombrar "bodas" y "cumpleaños" como público objetivo principal es, con la evidencia del propio código, apostar el esfuerzo de producto al segmento donde PaseLink es estructuralmente más débil frente a la competencia.

**¿Existe un nicho donde PaseLink debería enfocarse primero? Sí, y ya está construido, solo falta declararlo:** eventos privados con control de acceso real — donde hay cobro, cupo y necesidad de staff con permisos diferenciados. Concretamente: fiestas privadas/discotecas con entrada paga, quinceañeras y eventos grandes con seguridad, eventos corporativos con control de acceso, eventos escolares con necesidad real de saber quién retiró a quién (el campo `exitType` ya distingue salida temporal de definitiva, una señal de que el producto ya intuye este caso de uso mejor de lo que lo declara). Este nicho tiene tres propiedades que lo hacen ideal como beachhead: paga por naturaleza (hay dinero circulando en el evento, lo que habilita el modelo de comisión de la sección 12), tiene dolor operativo real y agudo (reconciliar pagos y controlar la puerta a mano es doloroso hoy, no es un "nice to have"), y es un segmento que Partiful/Apple Invites no tocan y que Eventbrite sirve mal por ser pesado y corporativo.

---

## 3. Flujo completo del usuario

**Crear cuenta → Crear evento:** el registro es de fricción baja (email/Google/Facebook), correcto. El wizard de creación, en cambio, tiene 8 pasos (`StepEventType`, `StepBasicInfo`, `StepDescriptionLocation`, `StepImageAndColors`, `StepSchedule`, `StepCapacityAndPayment`, `StepRegistrationFields`, `StepReviewTemplate`) antes de que el usuario vea nada parecido a un resultado terminado. Eso es una cantidad de pasos apropiada para un producto de configuración empresarial, no para el momento en que alguien decide si esta herramienta vale su tiempo. Es, con diferencia, el punto de abandono más probable de todo el flujo: se le pide al usuario que tome decisiones sobre método de pago y campos de registro personalizados antes de haber sentido ni una vez el placer de ver su invitación cobrar forma. Es una buena señal que exista una rama de trabajo activa (`feature/wizard-live-preview`) atacando exactamente este problema — es la corrección de rumbo más urgente de todo el flujo de producto.

**Personalizar:** aquí hay una inconsistencia de producto concreta: las plantillas comunitarias existen y están moderadas (`SubmitCommunityTemplate`, `MyCommunityTemplates`, tab "Plantillas" en `/admin`), pero **no están disponibles durante el wizard de creación**, solo en la edición posterior del evento (documentado explícitamente como límite en `INNOVATION_FEATURES_V1.md`). Esto significa que el usuario crea su evento con una de 7 plantillas base, y solo después, si vuelve a editar, puede descubrir que hay más opciones. Es un catálogo que se esconde de la gente en el momento exacto en que más lo necesitaría.

**Invitar:** compartir por WhatsApp/link/Instagram es de fricción baja, correcto. La mensajería masiva y los recordatorios automáticos de RSVP existen pero se despachan por cron de GitHub Actions, no en tiempo real — introduce una latencia invisible para el organizador que espera "enviar ahora" y que efectivamente se envíe ahora.

**Confirmaciones:** RSVP sí/no/no-seguro con acompañantes y autoedición está bien resuelto y es más flexible que la mayoría de la competencia analizada.

**Administración:** aquí el producto empieza a sentirse pesado. 16 permisos booleanos independientes de coorganizador, sin agrupación en roles, es una superficie de decisión que un organizador promedio (no técnico, organizando su segundo o tercer evento en la plataforma) no debería tener que enfrentar. Nadie razona en "¿le doy manageSeating pero no viewLiveDashboard?" — la gente razona en roles: "esta persona cuida la puerta", "esta persona maneja la comunicación", "esta persona tiene control total". Exponer los 16 flags crudos es optimizar por flexibilidad técnica en lugar de por velocidad de decisión humana.

**Check-in:** el momento más fuerte del producto, sin comparación. Escaneo con feedback inmediato, confirmación de pago integrada, bloqueo de reingreso, y el panel "Anfitrión en Vivo" con confetti agrupado — hay deleite genuino aquí. Es la prueba de que el equipo sabe construir un buen momento quiere; el problema es que el resto del producto no está diseñado con la misma disciplina de "un momento, bien resuelto" y en cambio acumula superficie.

**Post-evento:** este es el vacío más caro del flujo completo. Terminado el evento, lo único que existe es "andá a revisar tus reportes". No hay un cierre. No hay un resumen compartible, no hay una pieza de recuerdo, no hay un "así fue tu evento" que el organizador quiera mostrarle a alguien. Es exactamente el momento donde otros productos de consumo (y no de eventos — pensar en Spotify Wrapped, Strava, Duolingo) generan el mayor lazo emocional y el mayor loop de adquisición orgánica ("mirá lo que armé"), y PaseLink lo trata como una tarea administrativa. Todos los datos para resolver esto ya existen en el modelo (`checkinsByHour`, `paidCount`, fotos del muro, `rsvpYesCount`) — no falta información, falta la decisión de producto de convertirla en un momento.

---

## 4. MVP

Evaluado contra el nicho recomendado (eventos privados con control de acceso real), esto es lo que un MVP disciplinado contendría y lo que hoy sobra o falta.

**Pertenece al MVP:** creación de evento simplificada, gestión de invitados (manual + CSV), generación de pase QR, escaneo con control de cupo, RSVP con acompañantes, compartir por link/WhatsApp, reportes básicos, coorganizadores con roles simples (no 16 flags sueltos).

**Debería eliminarse o pausarse temporalmente** (no porque estén mal construidas, sino porque compiten por atención de desarrollo y de usuario contra el núcleo, sin evidencia todavía de que el mercado las pida): el marketplace de plantillas comunitarias con flujo editorial completo de moderación — es infraestructura de escala construida para un producto que todavía no tiene la masa de usuarios que la justifique; el recordatorio inteligente de salida — ingenioso, pero de uso infrecuente y bajo impacto en la decisión de adoptar o no el producto; el widget de clima — cosmético, no mueve ninguna métrica de negocio; el modo "Anfitrión en Vivo" en su forma actual — es un gran demo, pero antes de invertir más ahí hay que resolver el problema de fondo (pagos reales, onboarding), no sumarle una pantalla de TV a un producto que todavía no tiene claro quién lo usa.

**Son demasiado avanzadas para la etapa actual:** el sistema de 16 permisos granulares de coorganizador — resolver esto bien (con roles predefinidos) es más valioso que tenerlo completo pero incomprensible; el motor de visibilidad condicional de secciones por tags/RSVP/pago/acompañantes — potente, pero es complejidad de producto para audiencias que el equipo todavía no validó que la necesiten.

**Faltan y son críticas:** una pasarela de pago real (Stripe/Mercado Pago) — es, con diferencia, la ausencia más costosa de todo el producto, se desarrolla en la sección 9; onboarding guiado por caso de uso ("Quinceañera", "Evento privado con cobro", "Corporativo") en vez de un wizard genérico de 8 pasos idéntico para todos; un cierre de evento con valor emocional/compartible; y un concepto de cuenta de organización/agencia para quien gestiona eventos de terceros (event planners, venues) — hoy cada evento cuelga de un usuario individual sin ninguna capa de "workspace", lo que bloquea de raíz el camino más natural hacia clientes B2B recurrentes.

---

## 5. Clasificación de funcionalidades

**Imprescindibles:** crear evento, gestión de invitados (alta manual, grupo, CSV), pase QR único por invitado, escaneo de check-in/check-out con control de cupo, RSVP con acompañantes, compartir enlace, reportes básicos, coorganizadores con roles (simplificados).

**Importantes:** exportación PDF/Excel, campos de registro personalizados, catálogo de plantillas visuales curado, pagos manuales con comprobante (mejorado con foto, no solo texto libre), PWA instalable, recordatorios automáticos de RSVP, panel de información del evento (FAQ, horario, ubicación, transporte).

**Deseables:** seating chart, segmentación por etiquetas de invitado, visibilidad condicional de secciones, mensajería masiva segmentada, muro social, menú/dietas estructuradas.

**Innovadoras (diferenciadores reales, si se pulen y se comunican como tales):** confirmación de pago integrada al escaneo (única en el panorama competitivo analizado), panel "Anfitrión en Vivo", vinculación multi-dispositivo de invitado (`lockTokens`, resuelve un problema real y silencioso de navegadores in-app de Instagram/TikTok), infraestructura de vinculación invitado↔cuenta reutilizable para CRM futuro, plantillas comunitarias **si** se reposicionan como parte de una estrategia de contenido a más largo plazo, no como un lanzamiento del día uno.

**Innecesarias hoy** (no porque estén mal hechas, sino porque no sirven a ningún público objetivo declarado con la prioridad que se les dio): widget de clima, recordatorio inteligente de salida en su forma actual (proactiva sería el problema real, la versión on-demand construida resuelve un caso de uso menor), registro de regalos/cash-gift sin una pasarela de pago real detrás (hoy es una promesa vacía: "podés pedir dinero" pero no hay forma de cobrarlo dentro del producto), Apple/Google Wallet (correctamente descartado ya, la decisión fue acertada).

---

## 6. Modelo mental

El producto no se siente consistente, y la razón es rastreable: cada parte de PaseLink parece pertenecer a un producto distinto. El núcleo de check-in y permisos se siente como una herramienta de control de acceso de nivel empresarial (Eventbrite, un sistema de ticketing con seguridad). El muro social con historias y reacciones se siente como Partiful. El panel de información con FAQ, menú, transporte y regalos se siente como un sitio web de boda (Zola, WithJoy). El marketplace de plantillas comunitarias se siente como Canva. El panel "Anfitrión en Vivo" para pantalla grande se siente como un dashboard de discoteca. Cada pieza, evaluada sola, es una decisión razonable. Juntas, no arman una identidad — arman un catálogo de capacidades que un usuario nuevo no puede resumir en una frase, y un producto que no se puede resumir en una frase es un producto que cuesta recomendar de boca en boca.

**Demasiadas configuraciones, sí, de forma medible:** `EventData` tiene del orden de 50 campos de nivel superior, el sistema de coorganizadores expone 16 permisos booleanos independientes, y el motor de visibilidad condicional de secciones combina cuatro criterios distintos (etiquetas, estado de RSVP, estado de pago, si tiene acompañantes). Esta es una superficie de configurabilidad propia de un producto maduro con miles de usuarios que ya pidieron esa flexibilidad caso por caso. Construirla antes de tener esa base de usuarios es invertir en control fino para un problema que todavía no está validado que exista, a costa de simplicidad para el problema que sí existe (que alguien cree su primer evento rápido).

**Conceptos difíciles de entender:** la interacción entre `entryMode` (lista/abierta/híbrida), `capacity`, etiquetas de segmentación, y las reglas de visibilidad condicional no tiene ninguna guía visual que le explique a un organizador no técnico cómo se combinan. Un organizador razonable puede terminar con una sección de FAQ que nadie ve porque quedó condicionada a una etiqueta que no le asignó a ningún invitado, sin ningún indicio de por qué.

---

## 7. Experiencia del organizador

**Satisfacción:** el momento más alto es, sin duda, ver entrar gente en vivo — el contador subiendo, el confetti, el panel "Anfitrión en Vivo" en una pantalla grande el día del evento. Es un instante de control y logro real, y es la mejor prueba de que el equipo sabe diseñar un buen momento cuando se lo propone.

**Estrés:** el punto más alto de estrés no está en el evento, está antes: reconciliar pagos manuales. Con un evento de cien o más invitados y cobro por transferencia, el organizador hoy depende de que cada invitado escriba una referencia de texto correcta, y de revisar eso a mano contra su resumen bancario, sin ninguna foto de comprobante adjunta. Es exactamente el tipo de trabajo tedioso y propenso a error que un producto que se autodefine por "control de acceso" debería haber resuelto primero, no dejado para una fase de arquitectura sin construir. El wizard de 8 pasos es la segunda fuente de estrés, por decisión fatiga temprana (definir método de pago y campos de registro antes de ver el evento tomar forma).

**Debería ser memorable y no lo es:** el cierre. Terminado el evento, un organizador que gastó semanas planeando y el día completo operando debería recibir algo — un resumen, una pieza para compartir, una sensación de "esto valió la pena documentarlo". Hoy no recibe nada de eso.

---

## 8. Experiencia del invitado

El invitado recibe un enlace por WhatsApp, entra sin necesidad de cuenta (modo kiosko), confirma asistencia con acompañantes, puede editar sus propios datos y cancelar su asistencia después, ve un panel de información (FAQ, transporte, clima, menú, regalos), y si confirmó, accede al muro social. Al llegar, muestra su QR. Después del evento, el muro queda como memoria y, si creó cuenta, el evento queda listado en "Mis invitaciones".

**Lo que funciona bien:** la fricción de entrada es baja (no exige cuenta para RSVP), la autoedición y autocancelación son gestos de respeto poco comunes en la categoría (la mayoría de las plataformas analizadas no permiten que el invitado corrija sus propios datos sin pasar por el organizador), y la resolución de `lockTokens` para navegadores in-app de Instagram/TikTok es un detalle invisible pero real — sin él, una fracción no trivial de invitados jóvenes literalmente no podría abrir su pase dos veces desde el mismo enlace.

**Lo que genera fricción o desconfianza:** el flujo de pago del lado del invitado es débil justo donde más importa — reportar una referencia de pago en texto libre, sin poder adjuntar una foto del comprobante, es informal para algo que involucra dinero real, y no le da al invitado ninguna certeza visual de que su pago fue registrado correctamente antes de que el organizador lo confirme. El consentimiento legal obligatorio en el registro de cuenta es correcto desde el punto de vista de cumplimiento, pero añade fricción exactamente en el momento (crear cuenta desde el pase) donde el producto más necesita que el gesto se sienta liviano.

**Después del evento:** el muro persiste como recuerdo pasivo, pero no hay ningún gesto activo del producto hacia el invitado — ni un agradecimiento, ni una pieza para compartir, ni una invitación a guardar su perfil para la próxima vez que lo inviten a un evento en PaseLink. Es una oportunidad de retención del lado del invitado completamente sin explotar (ver sección 11).

---

## 9. Comparación competitiva (principios, no funciones)

**Partiful** — el principio que domina es fricción casi cero hasta el primer resultado visualmente terminado: crear una invitación hermosa toma minutos, sin pasos de configuración operativa. El wizard de 8 pasos de PaseLink viola ese principio directamente. PaseLink no debería copiar el catálogo visual de Partiful — debería copiar la disciplina de posponer toda decisión no esencial hasta después del primer "esto se ve bien".

**Apple Invites** — el principio es integración nativa profunda con la plataforma (Wallet, Mapas, Mensajes) sin costo de fricción para el usuario, subsidiada por ser Apple. PaseLink descartó Wallet correctamente por costo real de licencia — es una decisión de negocio sensata, no una carencia de producto. La lección real es otra: Apple Invites es una amenaza estructural e imposible de vencer en el segmento de invitación social casual, porque tiene distribución gratuita a nivel de sistema operativo. Ese es un argumento adicional, no solo de diferenciación sino de supervivencia, para que PaseLink no intente competir ahí.

**Eventbrite** — el principio es que el pago y el ticketing son el producto, todo lo demás es secundario, y por eso su credibilidad B2B es alta aunque su UX se sienta pesada y corporativa. PaseLink tiene una base técnica de check-in más moderna (transacciones atómicas, offline, confirmación integrada al escaneo) que Eventbrite, pero le falta exactamente lo que sostiene a Eventbrite: rieles de pago reales y la confianza que eso genera. Es la brecha más importante de todo el análisis.

**Luma** — el principio es distribución por red: seguir a un organizador, descubrir eventos de gente que ya seguís, minimalismo extremo. PaseLink no tiene ningún mecanismo de descubrimiento o red — cada evento es una isla. No hace falta copiar el descubrimiento público de Luma (no encaja con eventos privados), pero sí vale la pena adoptar su principio de "cada interacción debe sentirse instantánea y sin fricción", algo que el despacho por cron de PaseLink hoy no logra.

**Paperless Post / Greenvelope** — el principio es profundidad de catálogo de diseño como producto en sí mismo (miles de plantillas, economía de "monedas"). PaseLink no puede ni debe competir en volumen de catálogo con un equipo de una persona — esa es una batalla perdida de antemano. La decisión correcta, ya tomada implícitamente, es no competir ahí y profundizar en funcionalidad operativa en su lugar.

**Joy / WithJoy / Zola / Minted** — el principio es especialización total para un evento que ocurre una sola vez en la vida (registro de regalos integrado, sitios de boda, bloques de hotel). Una plantilla genérica de "boda" dentro de una plataforma multipropósito nunca le va a ganar a un producto construido exclusivamente para bodas — los novios exigen ese nivel de especialización precisamente porque es un evento irrepetible. Este es el argumento más fuerte para que PaseLink deje de nombrar "bodas" como público objetivo principal.

**Canva** — el principio es libertad creativa total vía editor libre. PaseLink decidió explícitamente no dar edición CSS libre (documentado en el gap analysis). Es la decisión correcta para mantener consistencia visual y evitar contenido malicioso, pero implica aceptar que un organizador con gusto de diseño fuerte va a preferir armar su invitación en Canva y usar otra herramienta para el RSVP — PaseLink no debería intentar competir en libertad de diseño, debería competir en que no hace falta diseñar nada para que se vea bien.

**Shopify (onboarding)** — el principio es tienda funcionando en minutos, con vista previa guiada en cada paso. Es exactamente lo que la rama `wizard-live-preview` está empezando a resolver — es la referencia correcta a seguir, y debería extenderse a reducir la cantidad de campos obligatorios antes del primer resultado visible, no solo a mostrar una vista previa de los mismos 8 pasos.

**Notion (edición)** — el principio es divulgación progresiva: la complejidad aparece solo cuando el usuario la invoca, no se muestra todo por defecto. Esto es lo opuesto a exponer 16 permisos y un motor de visibilidad condicional desde el primer uso. PaseLink debería ocultar toda su configuración avanzada detrás de un modo "avanzado" explícito.

**Airbnb (confianza en UX)** — el principio es invertir fuerte en señales de confianza exactamente en los momentos donde hay dinero o riesgo de por medio (reseñas, verificación, fotos). El flujo de pago manual de PaseLink no tiene ninguna señal de confianza visual más allá de una etiqueta de estado — ni foto de comprobante, ni confirmación visible en tiempo real para el invitado. Es el punto donde más se necesitaría aplicar este principio y menos se aplicó.

**Figma (feedback en vivo)** — el principio es ver el resultado de cada cambio al instante. La vista previa en vivo del wizard (en desarrollo) va en esta dirección; el resto del producto (permisos, plantillas comunitarias) todavía no la tiene, aunque es menos crítico dado que PaseLink no es, hoy, un producto colaborativo en tiempo real entre múltiples editores simultáneos.

---

## 10. Escalabilidad del producto

La limitación más seria no es de UX ni de alcance de funciones — es de infraestructura, y es autoimpuesta por una decisión de negocio explícita y documentada: PaseLink corre deliberadamente en el plan gratuito de Firebase (Spark), sin Cloud Functions, con toda la lógica de "servidor" resuelta por scripts de Node.js en cron de GitHub Actions. Esto es una decisión razonable para operar a costo cero en la etapa de validación actual, pero es un techo real y cercano: **una pasarela de pago real requiere un webhook que responda de forma síncrona, algo que un cron de ~10 minutos no puede ofrecer.** Esto significa que la funcionalidad de mayor apalancamiento de negocio (pagos reales, sección 12) está bloqueada no por falta de diseño — la interfaz `PaymentProvider` ya está pensada — sino por una decisión de infraestructura que en algún momento hay que revertir. Cuanto más tarde se tome esa decisión, más tarde se puede empezar a monetizar.

Otros límites de escalabilidad, menos urgentes pero reales: el modelo de datos de `EventData` ya acumula del orden de 50 campos de nivel superior sin ninguna segregación en subcolecciones para configuración poco usada — seguir agregando funciones al mismo documento va a volver cada vez más costoso evolucionar las reglas de seguridad y razonar sobre el esquema. No existe ningún concepto de cuenta de organización/agencia — cada evento cuelga directamente de un usuario individual, lo que bloquea de raíz el camino de negocio más natural para escalar ingresos rápido: vender a event planners y venues que gestionan decenas de eventos al año, no a un usuario que crea un evento cada seis meses. Y el rol de administrador se gestiona hoy a mano, evento por evento, en la consola de Firebase — aceptable a la escala actual, no a cien organizadores activos.

Por último, un riesgo de escalabilidad organizacional, no técnico: la amplitud de superficie construida (clima, seating, dashboard en vivo, marketplace de plantillas, recordatorio de viaje) por, aparentemente, un solo desarrollador, es un patrón que favorece velocidad de lanzamiento de funciones nuevas por sobre profundidad y calidad en el núcleo. Es sostenible mientras el producto no tenga usuarios reales exigiendo el núcleo — deja de serlo en el momento en que los tenga.

---

## 11. Retención

Esta es, junto con la ausencia de pago real, la debilidad estructural más seria del producto. La mayoría de los casos de uso nombrados como público objetivo (cumpleaños, bodas, graduaciones) son eventos infrecuentes por naturaleza — nadie organiza una boda dos veces al año. Eso significa que la retención no puede depender del caso de uso ocasional; tiene que venir de otro lado, y hoy no viene de ningún lado:

- No hay ningún mecanismo de red: no se puede "seguir" a un organizador, no hay descubrimiento de eventos de gente conocida, cada evento es una isla cerrada.
- No hay ningún beneficio acumulado por usar la plataforma repetidamente: un invitado que fue a cinco eventos en PaseLink no tiene un perfil que le ahorre tiempo la sexta vez (aunque la infraestructura para eso — `guestUid`, vinculación de invitaciones por email — ya está construida y sin usar para este fin).
- El CRM ligero de invitados recurrentes está completamente documentado en `PLATFORM_EXPANSION_ARCHITECTURE.md` y deliberadamente no construido, pospuesto por complejidad. Es la pieza de retención de mayor apalancamiento de todo el roadmap posible, y hoy está en la categoría de "algún día".
- No existe ningún incentivo de vuelta: ni descuentos por organizador recurrente, ni beneficios de datos acumulados, ni ninguna razón para abrir la app entre eventos.

`MyInvitations` (historial de eventos donde el usuario fue invitado) es un gancho de retención pasivo — existe, pero no genera ningún motivo activo de regreso.

**Conclusión:** hoy alguien vuelve a usar PaseLink solo porque tiene otro evento que organizar, con exactamente la misma fricción que la primera vez. No hay ningún motivo de negocio ni de producto para que la segunda vez sea mejor que la primera. Eso es el problema de retención más caro que tiene el producto, y también el que tiene la solución más clara: construir el CRM ya diseñado, y construir el recap post-evento (sección 3 y 15).

---

## 12. Monetización

**El modelo actual es la ausencia de modelo:** PaseLink es gratis, de punta a punta, para organizadores e invitados, con esa decisión declarada explícitamente en el propio código ("gratis durante el lanzamiento") y sin ninguna lógica de facturación, límites por plan, ni paywall en ningún punto del producto. Es una postura razonable para una etapa de validación temprana muy inicial — pero es insostenible como estrategia de mediano plazo para un producto que ya tiene la ambición y la superficie de un SaaS completo. Sin monetización no hay validación real de que alguien esté dispuesto a pagar por esto, y sin ese dato, cualquier inversión adicional en funciones nuevas es una apuesta a ciegas.

**Oportunidades de negocio, en orden de qué tan bien encaja con lo que el producto ya es:**

1. **Comisión por transacción sobre pagos reales**, una vez construida la pasarela — es el modelo con mejor alineación de incentivos posible (PaseLink gana cuando el organizador cobra, no antes), es el estándar de la categoría (Eventbrite), y convierte el diferenciador técnico más fuerte del producto (pago confirmado desde el escáner) en la fuente de ingresos, en vez de dejarlo como una función gratuita que no genera negocio.
2. **Suscripción por organizador o por "workspace"**, escalonada por cantidad de eventos activos o de invitados — el campo `plan` ya existe en el modelo de datos con un único valor posible hoy, literalmente esperando esta decisión.
3. **Plan de agencia/B2B** para event planners y venues que gestionan eventos de terceros — requiere primero construir el concepto de cuenta de organización (sección 10), pero es el segmento con mayor disposición a pagar de forma recurrente y predecible.
4. **Marketplace de plantillas con reparto de ingresos** para creadores de plantillas comunitarias — convierte una función hoy "innecesaria" (construida antes de tener escala) en una potencialmente valiosa, pero solo si se pausa hasta tener suficiente base de usuarios como para que un creador de plantillas tenga incentivo real de participar.

**Qué debería ser Premium:** seating chart, panel "Anfitrión en Vivo", mensajería masiva, reportes y exportaciones avanzadas, más de N eventos concurrentes, remover el branding de PaseLink del pase o de la invitación, y — con matiz — la pasarela de pago real cobrada como comisión por transacción y no como suscripción, para no penalizar a organizadores pequeños que recién empiezan a cobrar.

**Qué nunca debería cobrarse:** el check-in y el escaneo en sí (es la promesa central del producto — cobrar por eso mata la adopción antes de que nadie llegue a confiar en la herramienta), el RSVP básico, una lista de invitados de tamaño pequeño/razonable, y cualquier función de accesibilidad — cobrar por accesibilidad no es una palanca de negocio, es una línea ética que no conviene cruzar.

---

## 13. Roadmap ideal

### Próximos 3 meses
- **Producto:** declarar y comunicar el nicho inicial (eventos privados con control de acceso real); construir presets de rol para coorganizadores (reemplazar los 16 flags sueltos como experiencia por defecto); mover selección de plantillas comunitarias al wizard de creación.
- **UX:** terminar y lanzar el wizard con vista previa en vivo, reduciendo a 3-4 pasos obligatorios antes de mostrar el resultado; agregar carga de foto de comprobante al flujo de pago del invitado.
- **Negocio:** definir y anunciar un modelo de precios simple (aunque sea "gratis hasta N invitados, luego por evento"), aunque la pasarela de pago real todavía no exista — el objetivo es empezar a medir disposición a pagar.
- **Infraestructura:** decidir formalmente si se migra a Blaze/serverless para habilitar webhooks síncronos — es la decisión bloqueante de la que depende todo el trimestre siguiente.

### Próximos 6 meses
- **Producto:** pasarela de pago real (Stripe/Mercado Pago) integrada al flujo de check-in existente; recap post-evento compartible (estadísticas + fotos del muro + pieza visual).
- **UX:** simplificar el modelo de configuración de evento con divulgación progresiva (ocultar segmentación, visibilidad condicional y seating detrás de un modo avanzado).
- **Negocio:** lanzar comisión por transacción sobre pagos reales; explorar plan de agencia con 3-5 clientes piloto (event planners o venues).
- **Infraestructura:** migrar el envío de notificaciones/mensajería masiva de cron a un mecanismo de menor latencia; segmentar el esquema de `EventData` para sostener crecimiento futuro sin comprometer las reglas de seguridad.

### Próximo año
- **Producto:** CRM ligero de invitados recurrentes (ya arquitecturado, construir); concepto de cuenta de organización/workspace para múltiples eventos y clientes.
- **UX:** llevar la accesibilidad de 54/100 a un nivel que pueda usarse activamente como argumento de venta en el segmento corporativo/escolar.
- **Negocio:** evaluar expansión a un segundo nicho adyacente (por ejemplo, eventos corporativos con necesidades de seguridad más formales) solo después de haber validado ingresos sostenidos en el nicho inicial.
- **Infraestructura:** revisar si la arquitectura basada en Firestore + scripts sigue siendo adecuada a la escala alcanzada, o si conviene una capa de backend más tradicional para las partes de mayor carga (pagos, notificaciones).

---

## 14. Riesgos

**Técnicos:** un solo desarrollador sosteniendo una superficie de producto amplia es un riesgo de continuidad de negocio, no solo de velocidad. El techo del plan Spark bloquea directamente la función de mayor apalancamiento de negocio (pagos reales). La dependencia de niveles gratuitos de terceros (EmailJS, ya forzó sacrificar una función por su límite de plantillas, según el historial del proyecto) va a repetirse con más servicios a medida que crezca el uso real. La ausencia de tests sobre las reglas de seguridad de Firestore y sobre la lógica de cupo/check-in (admitida en el propio README) es un riesgo alto justamente en la parte del producto que maneja dinero y control de acceso.

**De UX:** la sobrecarga de configuración aleja a organizadores no técnicos, que son la mayoría del público nombrado. Un puntaje de accesibilidad de 54/100 no es solo una deuda técnica — es un riesgo legal y de exclusión real si el producto avanza hacia el segmento corporativo o escolar, donde la accesibilidad suele ser un requisito de compra, no una cortesía.

**De negocio:** monetización cero significa que no hay ninguna señal real de mercado validando el producto — se puede seguir construyendo funciones durante meses sin saber si alguien pagaría por ninguna de ellas. La falta de un público objetivo declarado hace que cualquier inversión en adquisición (marketing, contenido, partnerships) sea ineficiente porque no hay a quién dirigirla con precisión.

**De mercado:** la categoría de invitaciones digitales está saturada de jugadores bien financiados (Eventbrite, Canva) y de productos de consumo muy queridos con estética superior (Partiful). Competir en el segmento social casual contra Apple Invites es, además, una batalla estructuralmente perdida — Apple tiene distribución gratuita a nivel de sistema operativo que ningún startup puede igualar.

**De competencia directa:** si PaseLink no declara y ejecuta sobre el nicho de eventos con control de acceso real pronto, cualquiera de los jugadores de ticketing establecidos (o un nuevo entrante bien financiado) puede construir la misma combinación de check-in + pago + permisos con más recursos y llegar primero a ese mercado, que hoy nadie está sirviendo bien.

---

## 15. Oportunidades — las 5 mejoras que duplicarían el valor del producto

**1. Pasarela de pago real integrada al check-in.** Es la mejora de mayor apalancamiento posible porque resuelve tres problemas a la vez: elimina el punto de mayor estrés del organizador (reconciliar pagos a mano), habilita el único modelo de negocio que se alinea de forma natural con el uso del producto (comisión por transacción), y convierte el diferenciador técnico más fuerte de PaseLink (confirmación de pago desde el escáner) de una curiosidad interesante en una razón de peso real para elegir la plataforma sobre cualquier competidor. Es también la más cara de construir, porque exige salir del plan gratuito de infraestructura — exactamente por eso hay que empezarla ya.

**2. Declarar el nicho y rediseñar el onboarding alrededor de él.** Pasar de "cualquier evento con lista de invitados" a "eventos privados con control de acceso real" no cuesta ingeniería, cuesta decisión. Una vez tomada, permite construir plantillas de wizard por caso de uso concreto (quinceañera, fiesta privada con cobro, evento corporativo), lo que reduce la fricción del wizard de 8 pasos sin necesariamente eliminar ningún campo — simplemente los precompleta con supuestos razonables para ese caso de uso. Esta mejora duplica el valor no agregando nada nuevo, sino haciendo que lo que ya existe se sienta hecho para la persona que lo está usando.

**3. Recap post-evento compartible.** Con los datos ya disponibles (asistencia por hora, recaudación, fotos del muro), construir una pieza de cierre — visual, memorable, compartible — convierte el final del evento, hoy un vacío, en el momento de mayor retorno emocional y el mecanismo de adquisición orgánica más barato disponible ("mirá cómo quedó mi evento"). Es una mejora relativamente barata de construir en comparación con su impacto potencial en retención y boca a boca.

**4. CRM ligero de invitados recurrentes.** Ya está arquitecturado y deliberadamente sin construir. Es la pieza que convierte el uso ocasional (un evento cada tanto) en un hábito real para quien organiza con más frecuencia (venues, planners, colegios, empresas) — exactamente el segmento con mayor valor de vida útil. Construirlo antes que seguir sumando funciones de borde es una decisión de secuencia, no de ambición: sin retención, cada función nueva sirve a un usuario que probablemente no vuelva a usarla.

**5. Simplificación radical de la superficie de configuración vía roles y divulgación progresiva.** Reemplazar los 16 permisos sueltos por 3-4 roles con nombre y ocultar seating, segmentación y visibilidad condicional detrás de un modo avanzado no reduce el poder del producto para quien lo necesita — reduce el costo cognitivo de entrada para todos los demás. Es la mejora de menor costo de ingeniería de las cinco y la que más rápido puede implementarse, y desbloquea que el resto de las mejoras (sobre todo el onboarding por nicho) tengan un terreno simple sobre el cual construirse.

---

## Resumen ejecutivo

### Las 10 fortalezas más importantes de PaseLink

1. Check-in atómico con control de cupo en tiempo real, con funcionamiento offline vía PWA — la base técnica más sólida de todo el producto.
2. Confirmación de pago integrada directamente al flujo de escaneo — combinación que ninguna de las 12 plataformas competidoras analizadas tiene.
3. Permisos granulares de coorganizador (16 dimensiones) — exceso de complejidad hoy, pero base sólida para construir roles claros mañana.
4. PWA instalable con precaching optimizado deliberadamente — inversión técnica real, no trivial.
5. Infraestructura de vinculación invitado↔cuenta (`guestUid`, recuperación por email) ya construida y lista para sostener un CRM futuro.
6. Tratamiento serio de la accesibilidad, con auditoría profunda propia y remediación activa — diferenciador ético y potencialmente comercial poco común en la categoría.
7. El panel "Anfitrión en Vivo" es un momento de deleite genuino y una demostración de que el equipo sabe diseñar bien cuando se enfoca.
8. Exportaciones de datos de negocio reales (recaudación, horarios pico, asistencia) más allá de lo que la mayoría de la competencia ofrece.
9. Costo de infraestructura casi nulo, lo que permite validar el producto sin quemar presupuesto mientras no hay ingresos.
10. Cultura de documentar el "por qué" de cada decisión de producto directamente en el código — señal de madurez de ingeniería que acelera cualquier futura incorporación al equipo.

### Las 10 debilidades más importantes de PaseLink

1. La propuesta de valor no se puede explicar en una frase ni entender en 30 segundos.
2. El público objetivo declarado ("cualquier evento con lista de invitados") es, en la práctica, ausencia de público objetivo.
3. Monetización cero — sin ninguna señal de mercado real sobre disposición a pagar.
4. Sin pasarela de pago real, lo que deja sin resolver el mayor dolor operativo del organizador y bloquea el modelo de negocio más natural.
5. Techo de infraestructura autoimpuesto (plan gratuito, sin funciones de servidor síncronas) que impide justamente lo que el producto necesita para monetizar.
6. Sobrecarga de configuración (permisos, visibilidad condicional, ~50 campos de evento) construida por delante de la validación de usuarios reales que la necesiten.
7. Wizard de creación de 8 pasos sin recompensa temprana, con alto riesgo de abandono antes del primer resultado visible.
8. Ausencia total de un cierre post-evento memorable — se pierde el momento de mayor potencial emocional y viral de todo el producto.
9. Sin ningún mecanismo de retención o red — nada trae a un organizador de vuelta entre eventos, ni conecta a un invitado con su historial entre eventos distintos.
10. Amplitud de superficie de producto sostenida, aparentemente, por un solo desarrollador — riesgo de velocidad, calidad y continuidad del negocio.

### Las 10 decisiones de mayor impacto si fuera CPO de PaseLink

1. Declarar públicamente el nicho inicial — eventos privados con control de acceso real — y aceptar decir que no, por ahora, a bodas casuales y cumpleaños informales.
2. Congelar por uno o dos trimestres toda función nueva "de borde" (clima, marketplace de plantillas, wallet, recordatorio de salida) y redirigir el esfuerzo completo al loop núcleo: crear → invitar → confirmar → cobrar → controlar el acceso.
3. Iniciar de inmediato la construcción de la pasarela de pago real como la iniciativa de infraestructura número uno, aceptando el costo de migrar fuera del plan gratuito.
4. Lanzar un modelo de precios simple ya, aunque incompleto, para empezar a medir disposición real a pagar antes de invertir más en funciones nuevas.
5. Terminar y lanzar el wizard con vista previa en vivo, reduciendo los pasos obligatorios antes del primer resultado visible — es la mejora de adopción más barata disponible hoy.
6. Reemplazar los 16 permisos sueltos de coorganizador por 3-4 roles con nombre, dejando el detalle fino solo para un modo avanzado opcional.
7. Construir el recap post-evento compartible como iniciativa de producto explícita, no como función menor — es la palanca de retención y adquisición orgánica más barata disponible con los datos que ya existen.
8. Sacar el CRM ligero de invitados recurrentes del estado de "solo arquitectura" y ponerlo en el roadmap de los próximos seis meses, no del "algún día".
9. Convertir el resultado de la auditoría de accesibilidad en un argumento de venta activo para el segmento corporativo y escolar, en lugar de tratarlo solo como cumplimiento interno.
10. Incorporar una segunda persona de producto o diseño antes de seguir ensanchando el alcance del producto — hoy el riesgo de diluir calidad y de depender de una sola persona es más alto que el riesgo de avanzar más despacio.
