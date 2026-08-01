output "site_uptime_check_id" {
  value = google_monitoring_uptime_check_config.site.uptime_check_id
}

output "firebase_hosting_uptime_check_id" {
  value = google_monitoring_uptime_check_config.firebase_hosting.uptime_check_id
}

output "notification_channel_id" {
  value = google_monitoring_notification_channel.email.name
}
