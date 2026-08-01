# ---- "El sitio no responde" / "caída continua durante varios minutos" ----
# Mismo patrón recomendado por Google para alertar sobre un uptime check:
# cuenta observaciones FALLIDAS (REDUCE_COUNT_FALSE) agregadas entre TODAS
# las regiones del checker (group_by_fields) dentro de una ventana de
# var.uptime_alert_alignment_period_seconds. threshold_value = 1 (con
# comparación ">") dispara con 2 o más fallas agregadas en esa ventana — una
# sola falla aislada de una región (blip de red puntual) no alcanza,
# evitando el falso positivo que el ticket pide minimizar.
resource "google_monitoring_alert_policy" "site_down" {
  display_name = "PaseLink — sitio principal no responde"
  combiner      = "OR"

  conditions {
    display_name = "Uptime check fallando (www.paselink.com)"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"uptime_url\"",
        "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\"",
        "metric.label.check_id = \"${google_monitoring_uptime_check_config.site.uptime_check_id}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "0s"
      aggregations {
        alignment_period     = "${var.uptime_alert_alignment_period_seconds}s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.project_id", "resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]
  # Si el sitio se recupera y deja de fallar, la alerta se cierra sola a los
  # 30 min sin intervención manual (en vez de quedar "abierta" para siempre
  # esperando un cierre explícito).
  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "El sitio principal (www.paselink.com) dejó de responder correctamente en al menos 2 chequeos dentro de los últimos ${var.uptime_alert_alignment_period_seconds / 60} minutos, agregando todas las regiones del checker. Ver infra/terraform/README.md para contexto de esta alerta."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "firebase_hosting_down" {
  display_name = "PaseLink — Firebase Hosting no responde"
  combiner      = "OR"

  conditions {
    display_name = "Uptime check fallando (app-pases-9e6e7.web.app)"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"uptime_url\"",
        "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\"",
        "metric.label.check_id = \"${google_monitoring_uptime_check_config.firebase_hosting.uptime_check_id}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "0s"
      aggregations {
        alignment_period     = "${var.uptime_alert_alignment_period_seconds}s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.project_id", "resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]
  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "Firebase Hosting (app-pases-9e6e7.web.app) dejó de responder correctamente en al menos 2 chequeos dentro de los últimos ${var.uptime_alert_alignment_period_seconds / 60} minutos. Si esta alerta dispara pero 'sitio principal no responde' NO, el problema es específico de Firebase Hosting (no del DNS/proxy de www.paselink.com)."
    mime_type = "text/markdown"
  }
}

# ---- "El tiempo de respuesta supera un umbral" ----
# A diferencia de las de arriba, esta SÍ usa `duration` (no solo el conteo
# agregado por ventana): la latencia promedio tiene que quedar por encima
# del umbral de forma SOSTENIDA durante `duration`, no un solo pico
# momentáneo — mismo espíritu de "evitar falsos positivos" del ticket.
resource "google_monitoring_alert_policy" "site_latency" {
  display_name = "PaseLink — latencia alta (sitio principal)"
  combiner      = "OR"

  conditions {
    display_name = "Latencia del uptime check por encima del umbral"
    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"uptime_url\"",
        "metric.type = \"monitoring.googleapis.com/uptime_check/request_latency\"",
        "metric.label.check_id = \"${google_monitoring_uptime_check_config.site.uptime_check_id}\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = var.latency_threshold_ms
      duration        = "300s"
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MEAN"
        cross_series_reducer = "REDUCE_MEAN"
        group_by_fields      = ["resource.label.project_id", "resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]
  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = "El tiempo de respuesta promedio de www.paselink.com superó ${var.latency_threshold_ms}ms de forma sostenida durante al menos 5 minutos."
    mime_type = "text/markdown"
  }
}
