# Uptime Checks nativos de Cloud Monitoring — reemplazan (durante la
# transición, en paralelo con) .github/workflows/uptime-check.yml. Ver
# infra/terraform/README.md para el plan de migración completo.

# ---- Sitio principal (dominio propio) ----
# El que de verdad usan los invitados/organizadores. Mismo chequeo de
# contenido ("PaseLink" en el body) que ya hacía el workflow de GitHub, para
# no perder cobertura al migrar: un 200 con una página de error genérica del
# proxy/CDN también cuenta como "caído".
resource "google_monitoring_uptime_check_config" "site" {
  display_name = "PaseLink — sitio principal (www.paselink.com)"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    content_matchers {
      content = "PaseLink"
      matcher = "CONTAINS_STRING"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.site_host
    }
  }

  # STATIC_IP_CHECKERS (el default de Cloud Monitoring, explícito acá por
  # claridad) corre el check desde ~6 ubicaciones repartidas por el mundo a
  # la vez (no una sola región) — es el requisito del ticket de "múltiples
  # ubicaciones geográficas para detectar caídas reales", y de paso permite
  # distinguir una caída real de un problema de red puntual entre UNA región
  # y el sitio. La alternativa, VPC_CHECKERS, es para recursos privados
  # dentro de una VPC — no aplica acá, todo lo que se monitorea es público.
  checker_type = "STATIC_IP_CHECKERS"
}

# ---- Firebase Hosting (dominio *.web.app, sin pasar por el DNS propio) ----
# Chequeo separado del de arriba a propósito: si ESTE falla pero el de
# www.paselink.com no, el problema es del DNS/proxy del dominio propio, no
# de Firebase Hosting. Si los dos fallan juntos, es Firebase Hosting (o el
# hosting subyacente) el que está caído.
resource "google_monitoring_uptime_check_config" "firebase_hosting" {
  display_name = "PaseLink — Firebase Hosting (app-pases-9e6e7.web.app)"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    content_matchers {
      content = "PaseLink"
      matcher = "CONTAINS_STRING"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.firebase_hosting_host
    }
  }

  checker_type = "STATIC_IP_CHECKERS"
}

# ---- Cloud Functions críticas ----
# NO hay ningún check acá: al momento de escribir este archivo, todas las
# Cloud Functions del proyecto (functions/src/index.ts) son `onCall`
# (Callable), no `onRequest` — no exponen una URL HTTP simple que un uptime
# check pueda pegarle con un GET; requieren el formato de request específico
# del SDK de Firebase (POST + payload + token de App Check/Auth), que un
# uptime check no puede replicar. Fraude de "si aplica" del ticket: hoy no
# aplica. Ver README.md "Cómo agregar un nuevo servicio" para el patrón a
# seguir el día que exista un endpoint HTTP público que valga la pena
# monitorear (p.ej. un webhook de una pasarela de pago).
