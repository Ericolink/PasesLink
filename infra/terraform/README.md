# Monitoreo de disponibilidad (Cloud Monitoring)

Reemplazo de `.github/workflows/uptime-check.yml` por Uptime Checks nativos
de Google Cloud Monitoring — monitoreo real desde múltiples regiones,
integrado con el mismo proyecto de GCP que ya usa Firebase (`app-pases-9e6e7`),
en vez de un cron corriendo en runners de GitHub.

## Qué crea este Terraform

- **2 Uptime Checks** (`uptime_checks.tf`), cada uno chequeado cada 60s desde
  ~6 regiones del mundo a la vez:
  - `www.paselink.com` (el dominio real que usan los invitados/organizadores).
  - `app-pases-9e6e7.web.app` (Firebase Hosting sin pasar por el DNS del
    dominio propio — separarlos permite distinguir un problema de DNS/proxy
    de uno de Firebase Hosting en sí).
  - Ninguna Cloud Function tiene check propio: todas son `onCall`
    (Callable), no exponen una URL HTTP simple monitoreable con un GET. Ver
    "Cómo agregar un nuevo servicio" más abajo si esto cambia.
- **1 canal de notificación por email** (`notification_channels.tf`). Sin
  Discord todavía — ver "Discord (pendiente)" más abajo.
- **3 políticas de alerta** (`alert_policies.tf`):
  - Sitio principal no responde (2+ chequeos fallidos agregados en 5 min).
  - Firebase Hosting no responde (mismo criterio).
  - Latencia alta y sostenida del sitio principal (>3s de promedio durante
    5 min seguidos).

## Cómo aplicarlo

Requiere la [CLI de Terraform](https://developer.hashicorp.com/terraform/install)
y estar autenticado contra GCP (`gcloud auth application-default login`, o
la CLI de `gcloud` instalada y logueada con una cuenta que tenga el rol
`roles/monitoring.editor` sobre `app-pases-9e6e7`).

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # completar notification_email
terraform init
terraform plan    # revisar qué se va a crear antes de aplicar
terraform apply
```

Nada de esto toca `firestore.rules`, Hosting ni las Cloud Functions — son
recursos de Cloud Monitoring, un servicio separado que solo LEE la
disponibilidad pública del sitio.

## Plan de transición (ambos sistemas en paralelo)

Por pedido del ticket, `.github/workflows/uptime-check.yml` **sigue activo**
después de este cambio — no se toca todavía. Plan:

1. Aplicar este Terraform (arriba).
2. Dejar correr ambos sistemas 1-2 semanas, comparando:
   - ¿Cloud Monitoring avisó las mismas caídas que GitHub Actions, sin
     retraso relevante?
   - ¿Hubo falsos positivos de alguno de los dos que el otro no repitió?
   - Nota: durante esta ventana es normal y esperado recibir el aviso de
     una misma caída DOS veces (Discord vía GitHub Actions + email vía
     Cloud Monitoring) — no es un bug a corregir, es justamente lo que
     permite comparar. Ver la consideración del ticket sobre "evitar
     alertas duplicadas": aplica a partir de que se retire uno de los dos
     sistemas, no durante la comparación.
3. Con el nuevo sistema validado, retirar lo legado:
   - Borrar `.github/workflows/uptime-check.yml` completo.
   - NO tocar el job `notify_failure` de `firebase-hosting-merge.yml` — avisa
     fallas de *deploy*, no de uptime, es un sistema distinto (ver
     `project_alerts_phase4` en la memoria del proyecto).
   - El secret `DISCORD_WEBHOOK_URL` NO se borra: además de
     `uptime-check.yml`, lo sigue usando el job `notify_failure` de
     `firebase-hosting-merge.yml` (avisos de deploy fallido).
   - Actualizar este README y cualquier mención al workflow legado (buscar
     `uptime-check.yml` en el repo).

## Discord (pendiente)

Cloud Monitoring no tiene un tipo de canal nativo para Discord. El puente
más directo, cuando se decida agregarlo:

1. Canal de notificación tipo `pubsub` (en vez de/además del de email) que
   publica el payload de la alerta a un tópico de Pub/Sub.
2. Una Cloud Function `onMessagePublished` (mismo patrón que ya usa el
   proyecto para triggers de Firestore, ver `functions/src/triggers/`) que
   suscribe a ese tópico, reformatea el JSON de la alerta a un mensaje
   legible, y lo postea al mismo `DISCORD_WEBHOOK_URL` que ya usan
   GitHub Actions y las reglas de Sentry.

No se implementó en esta fase a propósito — primero se valida que el canal
de email funciona y que las políticas de alerta no generan ruido, y recién
después se suma la complejidad de una Function nueva para el puente.

## Cómo agregar un nuevo servicio al monitoreo

Ejemplo: el día que exista un endpoint HTTP público que valga la pena
vigilar (un webhook de una pasarela de pago, un futuro health-check propio):

1. Copiar el bloque `google_monitoring_uptime_check_config` de
   `uptime_checks.tf` que más se parezca (HTTP simple → copiar `site`;
   necesita headers/POST → ver el argumento `http_check.headers` /
   `http_check.body` en la [documentación del provider](https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/monitoring_uptime_check_config)).
2. Ajustar `display_name`, `monitored_resource.labels.host` y el path.
3. Copiar una de las políticas de `alert_policies.tf` (`site_down` para
   "no responde", `site_latency` para latencia), reemplazando la referencia
   a `google_monitoring_uptime_check_config.site.uptime_check_id` por el
   `uptime_check_id` del recurso nuevo.
4. `terraform plan` para confirmar que solo agrega recursos nuevos, `apply`.

Si el endpoint nuevo es una Cloud Function `onRequest`, agregarla también en
`functions/src/index.ts` con una región explícita (`{ region: var.region }`
del lado de la Function) para que quede en la misma región documentada acá
en `variables.tf`.
