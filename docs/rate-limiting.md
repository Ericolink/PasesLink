# Rate limiting de Callables públicas

Código: `functions/src/lib/rateLimit.ts` (primitivas, límite particionado
exacto e IP del cliente), `functions/src/lib/guestByToken.ts` (política de
búsqueda de pases, `findGuestByTokenForCallable`) y
`functions/src/lib/unknownIpTelemetry.ts` (resumen de IP desconocida). Parte de
T1/T1.1/T1.3 de P0-4.

**Estado:** código y pruebas listos contra el emulador. **Todavía no protege
nada en producción**: ninguna Callable desplegada lo usa (las primeras serán
G1/G2) y faltan los pasos de infraestructura de la sección 9.

## 1. Principios

- **Compartido entre instancias:** contadores de ventana fija en Firestore
  (colección `rateLimits`, documentos `{ count, expiresAt }`), no en memoria
  (con `maxInstances: 10`, un límite en memoria se multiplicaría por 10).
- **Sin datos personales:** el sujeto (IP, eventId) se seudonimiza con
  HMAC-SHA256 y `RATE_LIMIT_HMAC_KEY`. El qrToken nunca es sujeto. El cliente
  no puede leer ni escribir `rateLimits` (no hay `match` en `firestore.rules`).
- **Los fallos de otros nunca bloquean a quien no falló:** un invitado con un
  enlace válido solo puede quedar bloqueado por el límite total de su propia
  IP.
- **Una IP desconocida nunca es un contador global que bloquee a todos, ni
  una vía para evitar toda protección:** tiene límites propios, que nunca
  afectan a las IPs conocidas.

## 2. Límite particionado exacto (`consumePartitioned`)

Para contadores muy usados (la IP del WiFi del lugar del evento, el
presupuesto global de IP desconocida), el límite `L` se reparte en `P`
documentos:

- **Capacidades:** `floor(L/P)` en cada partición y el resto, de a 1, en las
  primeras. La suma es exactamente `L` para cualquier `L` (por ejemplo,
  241 → 61, 60, 60, 60; 3 → 1, 1, 1, 0).
- **Consumo:** arranca en una partición elegida al azar en el servidor (nunca
  un dato del cliente) y, si está llena, prueba las siguientes, con una
  transacción por intento. **Solo rechaza si todas estaban llenas.**
- **Exactitud:** dentro de una ventana un contador solo sube, así que ver las
  `P` particiones llenas significa que el total era exactamente `L`: no hay
  rechazos prematuros. Y como cada partición es transaccional, el total nunca
  pasa de `L`, aunque las solicitudes sean simultáneas.
- **Chequeos adicionales** (contadores de fallos, modo estricto) corren
  dentro de la misma transacción de cada intento.

## 3. Algoritmo de `findGuestByTokenForCallable`

1. **Valida** `eventId` y `qrToken`. Una entrada inválida no toca Firestore.
2. **Determina la IP** del cliente (sección 6).

### IP conocida

3. **Límite total por IP** (particionado, exacto). En cada intento, dentro de
   la transacción:
   - si la IP llegó al límite de fallos → `resource-exhausted` (`passMissIp`);
   - si la IP ya falló `STRICT_MISSES_PER_IP` veces, lee el contador de
     fallos del evento: si el evento está en modo estricto →
     `resource-exhausted` (`passStrictEvent`).

   Una IP limpia nunca lee un documento por evento.
4. **Busca** el pase. Si no lo encuentra: lee si el evento existe, suma el
   fallo a la IP y, **solo si el evento existe**, al evento. Responde
   `not-found`.

### IP desconocida

3. **Presupuesto global** de IP desconocida (particionado, exacto), **antes de
   cualquier otra lectura**: acota el costo de lo que sigue.
4. **¿Existe el evento?**
   - **No:** se cobra `unknownGhost` (global, solo para eventos inexistentes)
     y se responde `not-found` sin buscar invitados. Ningún documento por
     evento.
   - **Sí:** límite total de IP desconocida **de ese evento** (particionado,
     exacto). En cada intento: si el evento llegó al límite de fallos
     desconocidos → `passUnkMissEvent`; si está en modo estricto →
     `passStrictUnknownIp`.
5. **Busca** el pase. Si no lo encuentra, suma el fallo a los contadores de
   fallos desconocidos y de fallos del evento. Responde `not-found`.

En todos los casos, evento inexistente y token inexistente devuelven el mismo
`not-found` ("No encontramos este pase."). Si se superó algún límite, la
transacción no escribe nada.

## 4. Límites iniciales y justificación

No son definitivos: revisarlos con métricas (sección 10) después del primer
evento con tráfico real (SociaLink 2).

| Límite | Valor | Particiones | Por qué |
|---|---|---|---|
| `perIp`: búsquedas por IP conocida | 240/min | 4 | Cientos de invitados detrás del WiFi del lugar o del CGNAT de una operadora. |
| `missesPerIp`: fallos por IP conocida | 10 / 10 min | — | Un invitado legítimo casi nunca falla; un escáner falla siempre. |
| `missesPerEvent`: umbral de modo estricto | 30 / 10 min | — | **No bloquea por sí solo.** En modo estricto se bloquean las IPs con ≥ 2 fallos y las IP desconocidas de ese evento. |
| `STRICT_MISSES_PER_IP` | 2 | — | Deja pasar un error de tipeo aislado. |
| `unknownGlobal`: presupuesto global de IP desconocida | 1200/min | 8 | Debe alcanzar aunque una configuración de proxies inesperada deje a **todas** las IPs como desconocidas: equivale a dos eventos en plena llegada a la vez (2 × `unknownPerEvent`). 8 particiones porque en ese escenario sería el contador más usado. |
| `unknownPerEvent`: búsquedas con IP desconocida por evento | 600/min | 4 | Cubre la llegada de un evento grande (por ejemplo, 500 invitados que abren el pase dos veces en pocos minutos) si todas sus IPs quedaran desconocidas. |
| `unknownMissesPerEvent`: fallos con IP desconocida por evento | 10 / 10 min | — | Mismo valor que `missesPerIp`: sin poder distinguir solicitantes, se los trata como una sola "IP". Bloquea solo a las IP desconocidas de ese evento. |
| `unknownGhost`: IP desconocida contra eventos inexistentes | 100 / 10 min | — | Ninguna de esas solicitudes es legítima. Global porque no hay evento al que acotarlo. |

**Cómo ajustar:** cada valor es una constante en `PASS_LOOKUP_LIMITS`
(`guestByToken.ts`). Si se sube un límite muy usado, conviene subir también
sus `partitions` (a ojo, una partición cada 60–150 solicitudes por minuto). El
qrToken tiene 122 bits de entropía: estos límites no protegen la criptografía,
sino el costo de Firestore y el ruido de escaneos automatizados.

## 5. Costo y cota de documentos

### Operaciones de Firestore por solicitud

| Caso | Lecturas | Escrituras |
|---|---|---|
| IP conocida, pase encontrado | 3 (+1 si la IP ya tiene ≥ 2 fallos) | 1 |
| IP conocida, pase no encontrado | 4 | 2–3 |
| IP desconocida, evento existente, encontrado | 6 | 2 |
| IP desconocida, evento existente, no encontrado | 6 | 4 |
| IP desconocida, evento inexistente | 3 | 2 |
| Bloqueada (límite particionado lleno) | Hasta 1 por partición (4 u 8), con los chequeos de cada intento | 0 |

Los intentos extra del límite particionado solo aparecen cuando la partición
elegida está llena, es decir, cerca del límite.

**Peor caso del camino de IP desconocida:** el presupuesto global acota todo
ese camino a 1200 solicitudes por minuto, unas 7200 lecturas por minuto, o
unos 10 millones de lecturas por día si se sostuviera las 24 horas. Al precio
de lista de Firestore (del orden de 0,03 a 0,06 USD cada 100 000 lecturas,
según la ubicación; verificar en la consola de facturación), eso son unos
pocos dólares por día como máximo.

### Cota de documentos (por ventana)

| Documento | Cota |
|---|---|
| `passIp_*` | ≤ 4 por IP conocida por minuto |
| `passMissIp_*` | ≤ 1 por IP conocida cada 10 minutos (solo si falló) |
| `passMissEvent_*`, `passUnkEvent_*`, `passUnkMissEvent_*` | Solo para **eventos que existen**: ≤ 1 + 4 + 1 por evento y ventana |
| `passUnkGlobal_*` | ≤ 8 por minuto en toda la plataforma |
| `passUnkGhost_*` | 1 cada 10 minutos en toda la plataforma |

Un `eventId` inventado nunca crea un documento por evento, ni con IP conocida
ni con IP desconocida. Los documentos se borran con la política TTL (sección
9.2).

## 6. IP confiable

### Qué dice la documentación

- **Cloud Run functions, referencia de headers:** `X-Forwarded-For` es "una
  lista de las IPs por las que pasó la solicitud", con el ejemplo
  `clientIp, proxy1Ip, proxy2Ip`, y "la primera IP **suele** ser la del
  cliente". No dice qué proxies agrega Google ni protege contra valores
  enviados por el cliente.
- **Balanceador de carga externo:** agrega `<client-ip>,<load-balancer-ip>`
  al final y **no verifica** nada de lo anterior.

Ninguna garantiza la posición exacta para nuestro caso: Callables de segunda
generación invocadas directo en `us-central1-<proyecto>.cloudfunctions.net`,
sin dominio propio, rewrite de Hosting ni balanceador propio.

### Qué hace el código (`clientIpFromRequest`)

1. Descarta las últimas `TRUSTED_PROXY_HOPS` entradas (hoy 0).
2. Recorre la lista **de derecha a izquierda** saltando rangos privados y
   reservados y los rangos de proxies de Google (`35.191.0.0/16`,
   `130.211.0.0/22`).
3. La primera IP pública es el cliente. Una entrada falsificada por el
   cliente nunca queda a la derecha de la que agregó Google.
4. Si esa posición no es una IP válida (por ejemplo, IPv6 entre corchetes o
   IPv4 con puerto), la IP es **desconocida** y entra en los límites de la
   sección 3. Nunca queda sin protección.
5. **No** usa `req.ip` ni `socket.remoteAddress` (en Cloud Run, la IP del
   proxy interno, compartida por todos).
6. IPv6 se agrupa por /64; IPv4 mapeada (`::ffff:a.b.c.d`) se normaliza.

Si se agrega un balanceador propio, su IP es pública y quedaría como
"cliente": hay que subir `TRUSTED_PROXY_HOPS` a 1.

**Verificación pendiente en staging (sección 8):** hasta hacerla, no se sabe
si en Cloud Run real la IP se resuelve como se espera.

## 7. Riesgos residuales

1. **Atacante detrás de la misma IP pública que los invitados** (por ejemplo,
   en el WiFi del lugar): puede agotar los límites de esa IP y bloquear a
   todos los que la comparten durante la ventana. Con solo la IP no se lo
   puede separar. Mitigaciones: datos móviles, el pase sin conexión (P0-7) y
   App Check (P0-5).
2. **Configuración de proxies inesperada** (todas las IPs desconocidas): los
   invitados siguen pudiendo abrir sus pases dentro de `unknownPerEvent` y
   `unknownGlobal`, pero un atacante en ese mismo escenario comparte esos
   presupuestos con ellos. Se detecta con la métrica y la alerta de la
   sección 10.
3. **Spoofing si Google no agregara la IP real:** si la verificación en
   staging mostrara que Google no agrega la IP del cliente, el recorrido
   llegaría a entradas escritas por el atacante, que podría rotar su
   identidad. En ese caso hay que tratar **toda** solicitud como IP
   desconocida (o `TRUSTED_PROXY_HOPS` correcto), nunca confiar en lo que haya
   a la izquierda.
4. **Concurrencia en los fallos:** se cuentan con un incremento atómico
   después de la búsqueda; las solicitudes en vuelo pueden sumar algunos
   fallos de más antes de bloquear. Los límites totales sí son exactos.
5. **Ventanas fijas:** en el borde entre dos ventanas, un sujeto puede llegar
   hasta el doble del límite en poco tiempo.
6. **Invitados huérfanos:** si el documento de un evento se borrara sin sus
   invitados (un `deleteEvent` interrumpido), con IP desconocida esos pases
   responden `not-found` (no se busca en eventos inexistentes) y con IP
   conocida se seguirían encontrando.
7. **Fallo cerrado:** si falta o es corta `RATE_LIMIT_HMAC_KEY`, o Firestore
   falla, la Callable responde un `internal` genérico, sin devolver el pase.
   Si Firestore no responde, la búsqueda tampoco podría hacerse, así que no
   cuesta disponibilidad adicional.

## 8. Verificación en staging (sin registrar IPs)

Requiere una Callable que use el helper desplegada en **staging**: lo natural
es G1 (`getGuestPass`). No desplegar una Callable pública solo para esta
prueba sin autorización.

1. **Forma de `X-Forwarded-For`.** Abrir un pase de staging desde un teléfono
   con datos móviles y desde una computadora en otra red. En Cloud Logging:
   ```
   resource.labels.service_name="getguestpass"
   jsonPayload.forwardedShape:*
   ```
   Lo esperado es `public` o `public,infra…`, con `ipSource="forwarded"`. Si
   aparece `public,public` sin que el cliente haya enviado el header, Google
   agrega una IP pública después del cliente: **no habilitar** el límite por
   IP hasta revisar la sección 6. Si aparece `invalid`, el formato de Google
   no coincide con el del parser.
2. **Dos redes, dos contadores.** En `rateLimits` de staging, las búsquedas de
   los dos dispositivos deben crear documentos `passIp_<seudónimo>p<n>_<ventana>`
   con **seudónimos distintos**. Si son iguales, todas las IPs se están
   colapsando en una.
3. **Header falsificado.** Invocar la Callable con `curl` enviando
   `X-Forwarded-For: 1.2.3.4` desde la computadora del paso 2: el seudónimo
   de `passIp_` debe ser **el mismo** que sin el header.
4. Limpiar los documentos de prueba de `rateLimits` (o esperar al TTL).

## 9. Pasos de infraestructura pendientes (antes de la primera Callable que lo use)

### 9.1 Crear `RATE_LIMIT_HMAC_KEY`

Sin el secreto, el deploy de la Callable que lo declare falla. Un valor
distinto por proyecto, generado en el momento y nunca escrito en el repo, en
un chat ni en un ticket:

```
openssl rand -hex 32 | firebase functions:secrets:set RATE_LIMIT_HMAC_KEY --data-file=- --project paselink-staging
openssl rand -hex 32 | firebase functions:secrets:set RATE_LIMIT_HMAC_KEY --data-file=- --project app-pases-9e6e7
```

La service account de CI ya tiene `secretAccessor`. Rotar el secreto solo
reinicia los contadores en curso.

**Orden obligatorio:** primero crear el secreto en **ambos** proyectos y
recién después agregar `defineSecret('RATE_LIMIT_HMAC_KEY')` en
`functions/src/lib/secrets.ts` (junto con G1). `firebase-tools` resuelve
todos los `defineSecret` del código durante el descubrimiento del backend,
incluso en `deploy --only hosting` (por el rewrite `/e/**` a `eventJoinMeta`).
Declararlo antes de que exista rompe cualquier deploy, aunque ninguna función
lo use: pasó en T1 y se corrigió quitando la declaración.

### 9.2 Política TTL de `rateLimits.expiresAt`

```
gcloud firestore fields ttls update expiresAt --collection-group=rateLimits --enable-ttl --project=paselink-staging
gcloud firestore fields ttls update expiresAt --collection-group=rateLimits --enable-ttl --project=app-pases-9e6e7
```

`expiresAt` = fin de la ventana + 1 hora; el TTL de Firestore borra dentro de
las 24 horas siguientes, sin costo de escritura. Verificar con
`gcloud firestore fields ttls list --project=<proyecto>`.

### 9.3 Alerta por IP desconocida sostenida (pendiente, Terraform)

No se implementó en esta tarea (requiere cambios en `infra/terraform/`).
Propuesta, en la misma línea que `alert_policies.tf`:

- **Métrica basada en logs** `pass_lookup_unknown_ip`: cuenta las entradas con
  `jsonPayload.ipSource="unknown"`, una por invocación, así que es un conteo
  exacto.
- **Política de alerta:** más de 20 por minuto durante 10 minutos seguidos, al
  canal de Discord existente. En condiciones normales debería ser casi cero;
  un valor sostenido indica una configuración de proxies distinta de la
  esperada.

## 10. Observabilidad y revisión de métricas

Cada invocación registra en su log de cierre `passLookup` (`hit` o `miss`),
`ipSource` (`forwarded` o `unknown`), `forwardedShape` (clases, sin
direcciones) y, si aplica, `rateLimited` (`passIp`, `passMissIp`,
`passStrictEvent`, `passUnkGlobal`, `passUnkEvent`, `passUnkMissEvent`,
`passStrictUnknownIp`, `passUnkGhost`).

Además, cada instancia emite **como máximo un `warn` por minuto** con el
conteo de IP desconocidas del minuto anterior (`unknownIpCount`) y las formas
de header vistas (`forwardedShapes`, con tope de 10 formas distintas). Nunca
un `warn` por solicitud. Nada de esto registra tokens, IPs ni datos
personales.

Consultas útiles en Cloud Logging:

- Bloqueos: `jsonPayload.rateLimited:*`
- Fallos por evento: `jsonPayload.passLookup="miss"`, agrupando por
  `jsonPayload.eventId`
- IP desconocida (debería ser casi cero): `jsonPayload.ipSource="unknown"`
- Resúmenes de IP desconocida: `jsonPayload.unknownIpCount:*`

Qué revisar después del primer evento real:

- Bloqueos `passIp` durante la llegada de invitados → subir `perIp`.
- Reportes de "Demasiados intentos" con `passMissIp` → subir `missesPerIp`.
- Modo estricto sin un ataque real → subir `missesPerEvent`.
- Cualquier `ipSource="unknown"` frecuente → revisar la sección 6 antes de
  tocar `unknownPerEvent` o `unknownGlobal`.
