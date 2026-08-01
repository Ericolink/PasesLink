terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Sin backend remoto configurado a propósito (Fase inicial, un solo operador
# aplicando desde su máquina) — el estado queda local en
# infra/terraform/terraform.tfstate, que NO se commitea (ver .gitignore). Si
# en el futuro más de una persona necesita aplicar cambios, migrar a un
# backend "gcs" apuntando a un bucket del mismo proyecto es el paso natural,
# sin tener que rehacer ningún recurso de acá.
provider "google" {
  project = var.project_id
}
