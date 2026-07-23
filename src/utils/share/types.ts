// Contenido genérico para cualquier cosa "compartible" (evento, a futuro
// recordatorio/promo/invitación individual): un builder por tipo de contenido
// mapea su modelo de datos a esta forma, y el resto del pipeline (plantilla
// visual, motor de share, hoja de respaldo) no necesita saber de dónde vino.
import type { ShareRecipe } from '../../templates/shareRecipes'

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
  // Dominio del link (ej. "paselink.app"), mostrado en vez de la URL completa
  // o de un QR — el link ya no es tappable dentro de la imagen (Instagram no
  // lo permite fuera de su Link Sticker nativo), así que solo cumple un rol
  // de "sello de confianza"; el link real se copia al portapapeles al compartir.
  domainLabel: string
  url: string
  theme: ShareCardTheme
  recipe: ShareRecipe
}
