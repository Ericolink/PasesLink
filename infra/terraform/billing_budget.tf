# Presupuesto y alerta de gasto (Cloud Billing) — cierra un gap real: todo
# lo de alert_policies.tf alerta sobre COMPORTAMIENTO del sistema (sitio
# caído, latencia alta), nada alerta sobre GASTO. El incidente que motivó
# esto: una función en staging quedó en crash-loop generando costo
# continuo, y no hubo ninguna señal hasta que llegó la factura — esto es la
# alarma temprana equivalente para producción (var.project_id). Reemplaza
# el paso manual que ya estaba documentado (pero no hecho) en
# docs/backend-observability.md §9.1 ("Crear presupuesto" a mano en la
# Consola) con el mismo criterio que ese doc ya definía: umbrales
# 50/90/100%, notificando por el mismo canal que el resto de este
# Terraform.

# El filtro de proyecto de la Cloud Billing Budget API pide el NÚMERO de
# proyecto (formato "projects/<número>"), no el project ID de texto
# (app-pases-9e6e7) — se resuelve acá con una data source en vez de
# pedirle a quien aplique este Terraform que lo busque a mano.
data "google_project" "current" {
  project_id = var.project_id
}

resource "google_billing_budget" "production" {
  billing_account = var.billing_account_id
  display_name    = "PaseLink — presupuesto mensual de producción"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
    # Sin calendar_period explícito: el default de la API ya es MONTH,
    # que es justo lo que pide "presupuesto mensual".
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = tostring(var.monthly_budget_amount)
    }
  }

  # 50/90/100% — mismo criterio ya documentado en
  # docs/backend-observability.md §9.1, ninguno de los dos inventado acá.
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    # Mismo canal que ya usan site_down/firebase_hosting_down/site_latency
    # en alert_policies.tf — no se crea un canal nuevo para esto.
    monitoring_notification_channels = [
      google_monitoring_notification_channel.email.name,
    ]
    # false (default, explícito acá para que quede documentada la
    # decisión): además del canal de arriba, también notifica a quien
    # tenga roles/billing.admin o roles/billing.user sobre la cuenta de
    # facturación — redundancia útil para una alerta de este tipo, no la
    # desactivamos.
    disable_default_iam_recipients = false
  }
}
