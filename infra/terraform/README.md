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
- **1 presupuesto de gasto con alertas al 50/90/100%** (`billing_budget.tf`)
  — ver "Presupuesto y alerta de gasto" más abajo.

## Cómo aplicarlo

Requiere la [CLI de Terraform](https://developer.hashicorp.com/terraform/install)
y estar autenticado contra GCP (`gcloud auth application-default login`, o
la CLI de `gcloud` instalada y logueada). Dos permisos distintos, sobre dos
recursos distintos de GCP:

- `roles/monitoring.editor` sobre el proyecto `app-pases-9e6e7` — para los
  Uptime Checks/políticas de alerta/canal de notificación.
- `roles/billing.costsManager` (o `roles/billing.admin`) **sobre la cuenta
  de facturación**, no sobre el proyecto — para `billing_budget.tf`. Es un
  permiso distinto porque la cuenta de facturación es un recurso separado
  del proyecto (puede administrarla otra persona). Lo otorga quien
  administra la cuenta, en Consola → Facturación → Administración de la
  cuenta → Permisos.

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # completar notification_email + billing_account_id
terraform init
terraform plan    # revisar qué se va a crear antes de aplicar
terraform apply
```

Nada de esto toca `firestore.rules`, Hosting ni las Cloud Functions — son
recursos de Cloud Monitoring/Billing, servicios separados que solo LEEN la
disponibilidad pública del sitio y el gasto reportado, respectivamente.

## Presupuesto y alerta de gasto

`billing_budget.tf` crea un `google_billing_budget` sobre `project_id`
(`app-pases-9e6e7`), con notificaciones al mismo canal de email de
`notification_channels.tf` — no un canal nuevo. Reemplaza el paso manual
que ya estaba documentado (pero no hecho) en
`docs/backend-observability.md` §9.1.

**Antes de aplicar, hace falta completar dos cosas que este Terraform no
puede inferir:**

1. **`billing_account_id`** (`terraform.tfvars`, sin default) — el ID de la
   cuenta de facturación que paga el proyecto, formato
   `XXXXXX-XXXXXX-XXXXXX`. Conseguirlo con:
   ```bash
   gcloud billing accounts list
   ```
   o en Consola → Facturación → Administración de la cuenta. Distinto del
   `project_id` — una cuenta de facturación puede pagar varios proyectos.
2. **`monthly_budget_amount`** (`terraform.tfvars`, default `50` USD) — no
   hay ninguna referencia de gasto real en el repo (ni facturas ni un
   monto documentado en ningún lado), así que el default es un placeholder
   conservador acorde al plan Blaze de una app en esta escala. Ajustarlo al
   monto real esperado antes de aplicar, y de nuevo tras el primer mes de
   datos reales (mismo criterio que ya proponía el doc de observabilidad).

**API requerida**: `billingbudgets.googleapis.com` (Cloud Billing Budget
API), habilitada sobre el proyecto que usan las credenciales para llamar a
la API (normalmente `project_id`, `app-pases-9e6e7`). Verificar si ya está
habilitada:
```bash
gcloud services list --enabled --project=app-pases-9e6e7 | grep billingbudgets
```
Si no aparece, habilitarla antes de `terraform apply`:
```bash
gcloud services enable billingbudgets.googleapis.com --project=app-pases-9e6e7
```

**Qué NO hace este recurso a propósito**: no vincula ninguna acción
automática (como desactivar servicios al 100% del presupuesto) — solo
alerta. Cortar servicios automáticamente arriesga tirar abajo PaseLink para
usuarios reales en medio de un evento, que es peor que el gasto que se
quiere evitar (mismo criterio que ya descartaba
`docs/backend-observability.md` §9.1 punto 4).

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
