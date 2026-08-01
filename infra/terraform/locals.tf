# Cloud Monitoring pide el host pelado (sin esquema ni barra final) en
# monitored_resource.labels.host — se deriva acá en vez de duplicar el valor
# en dos variables distintas (una con https://, otra sin) que podrían
# desincronizarse.
locals {
  site_host             = trimsuffix(trimprefix(var.site_url, "https://"), "/")
  firebase_hosting_host = trimsuffix(trimprefix(var.firebase_hosting_url, "https://"), "/")
}
