# Solo email en esta fase (decisión explícita: Cloud Monitoring no tiene
# tipo de canal nativo para Discord — solo email, SMS, Slack, PagerDuty,
# Pub/Sub o un webhook HTTP genérico cuyo payload Discord no entiende sin un
# puente intermedio). El puente a Discord (Pub/Sub → Cloud Function →
# DISCORD_WEBHOOK_URL, reusando el mismo secret que ya usan
# .github/workflows/uptime-check.yml y las reglas de Sentry) queda
# documentado como paso futuro en README.md — se agrega recién cuando el
# canal de email esté validado, no antes.
resource "google_monitoring_notification_channel" "email" {
  display_name = "PaseLink — email de alertas"
  type         = "email"
  labels = {
    email_address = var.notification_email
  }
}
