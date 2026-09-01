variable "project_id" {
  description = "Proyecto de GCP/Firebase (ver .firebaserc en la raíz del repo)."
  type        = string
  default     = "app-pases-9e6e7"
}

# Cloud Monitoring Uptime Checks NO están atados a una región: por diseño
# corren desde varias ubicaciones globales a la vez (ver checker_type
# STATIC_IP_CHECKERS en uptime_checks.tf) — es justo lo que pide el ticket
# ("múltiples ubicaciones geográficas para detectar caídas reales"). Esta variable existe
# para el día que se agregue un health-check propio (Cloud Function
# onRequest, ver README §"Cómo agregar un nuevo servicio") — ESE recurso sí
# debe vivir en la misma región que el resto de las Functions/Firestore del
# proyecto, para no sumar latencia cross-región innecesaria. Confirmar con
# `firebase functions:list` o la consola de GCP si esto cambió — al momento
# de escribir este archivo, ninguna function del proyecto fija una región
# explícita, así que corren en el default de Cloud Functions v2:
# us-central1.
variable "region" {
  description = "Región de las Cloud Functions/Firestore del proyecto (para futuros recursos que sí sean region-scoped, no para los uptime checks en sí)."
  type        = string
  default     = "us-central1"
}

variable "site_url" {
  description = "Dominio propio real de PaseLink (el que usan los usuarios) — mismo valor que SITE_URL en .github/workflows/uptime-check.yml."
  type        = string
  default     = "https://www.paselink.com/"
}

variable "firebase_hosting_url" {
  description = "Dominio *.web.app que Firebase Hosting sirve por default, sin pasar por el DNS del dominio propio — permite distinguir 'se cayó Firebase Hosting' de 'se cayó el DNS/proxy de www.paselink.com'."
  type        = string
  default     = "https://app-pases-9e6e7.web.app/"
}

variable "notification_email" {
  description = "Correo que recibe las alertas de Cloud Monitoring (canal de notificación). Sin default a propósito: cada quien aplique este Terraform decide a qué correo llegan."
  type        = string
}

# "Varios minutos" (pedido del ticket) resuelto como: al menos 2
# observaciones fallidas agregadas entre TODAS las regiones del checker
# dentro de esta ventana. Con 6 regiones chequeando cada 60s, una sola
# región con un blip momentáneo no alcanza para disparar la alerta — hacen
# falta fallas que se sostengan o se repliquen entre regiones. Subir este
# valor reduce falsos positivos a costa de tardar más en avisar una caída
# real.
variable "uptime_alert_alignment_period_seconds" {
  description = "Ventana (en segundos) sobre la que se cuentan los checks fallidos antes de disparar la alerta de caída."
  type        = number
  default     = 300
}

# Umbral de latencia — ver considerations del ticket ("evitar falsos
# positivos"). 3s es generoso para un sitio SPA servido por un CDN (Firebase
# Hosting); si en la práctica el sitio responde mucho más rápido, bajar este
# valor detecta degradación real antes de que se sienta como una caída.
variable "latency_threshold_ms" {
  description = "Umbral de tiempo de respuesta (ms) que dispara la alerta de latencia."
  type        = number
  default     = 3000
}

# ---- Presupuesto de gasto (billing_budget.tf) ----
# Distinto de todo lo de arriba: esas variables alimentan alertas sobre
# COMPORTAMIENTO del sitio (uptime/latencia); estas dos alimentan una
# alerta sobre GASTO — el gap real que motivó agregar billing_budget.tf
# (ver ese archivo para el porqué).

# Sin default a propósito, mismo criterio que notification_email de arriba:
# el ID de cuenta de facturación (formato "XXXXXX-XXXXXX-XXXXXX") no está
# en ningún lado del repo ni se puede inferir del código — cada quien
# aplique este Terraform lo completa en su terraform.tfvars. Se consigue
# con `gcloud billing accounts list` o en Consola → Facturación →
# Administración de la cuenta (ver README.md).
variable "billing_account_id" {
  description = "ID de la cuenta de facturación de GCP (formato XXXXXX-XXXXXX-XXXXXX) que paga var.project_id."
  type        = string
}

# Sin ninguna referencia real de gasto en el repo (ni facturas, ni
# comentarios con un monto concreto) — placeholder conservador acorde al
# plan Blaze de una app en esta escala, mismo criterio ya documentado en
# docs/backend-observability.md §9.1 ("empezar con un presupuesto mensual
# conservador... ajustar tras el primer mes real de datos en vez de
# adivinar un número"). AJUSTAR este valor en terraform.tfvars (no acá)
# antes de aplicar, según lo que de verdad esperás gastar por mes.
variable "monthly_budget_amount" {
  description = "Presupuesto mensual de referencia (USD) para var.project_id. Placeholder conservador — ajustar según gasto real esperado/observado."
  type        = number
  default     = 50
}
