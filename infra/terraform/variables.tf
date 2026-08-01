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
