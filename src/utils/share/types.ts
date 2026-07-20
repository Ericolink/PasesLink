// Contenido genérico para cualquier cosa "compartible" (evento, a futuro
// recordatorio/promo/invitación individual): un builder por tipo de contenido
// mapea su modelo de datos a esta forma, y el resto del pipeline (plantilla
// visual, motor de share, hoja de respaldo) no necesita saber de dónde vino.
interface ShareCardTheme {
  accent: string
  accentDark: string
  accentSoft: string
  surface: string
  text: string
  textMuted: string
  fontFamily: string
  borderRadius: string
}

export interface ShareCardContent {
  title: string
  dateLabel?: string
  timeLabel?: string
  locationLabel?: string
  coverImageUrl?: string
  ctaLabel: string
  url: string
  theme: ShareCardTheme
}
