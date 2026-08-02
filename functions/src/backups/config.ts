// Configuración centralizada de los backups nativos de Firestore (ver
// docs/firestore-backups.md). El bucket se crea manualmente en Google Cloud
// Console/CLI (no vía código, ver la doc) — este archivo es la única fuente
// de verdad del nombre para que exportFirestore.ts y los tres
// scheduled/backupFirestore*.ts nunca se desincronicen.
export const BACKUP_BUCKET = 'app-pases-9e6e7-firestore-backups'

export const BACKUP_ROOT_PREFIX = 'firestore-backups'

export type BackupTier = 'daily' | 'weekly' | 'monthly'

/** Retención objetivo por nivel — informativa acá; la aplica de verdad el lifecycle de Cloud Storage (scripts/gcs/firestore-backups-lifecycle.json), nunca este código. */
export const BACKUP_RETENTION_DAYS: Record<BackupTier, number> = {
  daily: 30,
  weekly: 84, // 12 semanas
  monthly: 365, // 12 meses
}
