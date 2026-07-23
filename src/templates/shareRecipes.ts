import type { TemplateId } from '../types'

// Cómo se compone visualmente la tarjeta de compartir para cada plantilla —
// separado de templates.css a propósito: esa hoja de estilos está acoplada a
// selectores de la página de invitación completa (.invite-card, .invite-wall-*,
// repintado de .bg-white dentro de su scope) y reutilizarla tal cual dentro
// del nodo aislado que captura html-to-image repintaría clases utilitarias
// del propio share card de forma impredecible. Acá solo se traducen los
// mismos criterios de materialidad ya documentados en registry.ts/templates.css
// (ver src/design-system/DESIGN_GOVERNANCE.md) a un puñado de valores planos.
export interface ShareRecipe {
  // Fondo base — SIEMPRE un valor concreto (nunca undefined). Es la garantía
  // de que el PNG exportado jamás sea transparente, haya o no portada y falle
  // o no su carga (ver renderShareCardImage.ts).
  backgroundGradient: string
  // Gradiente oscuro de abajo hacia arriba, sobre portada o sobre el fondo
  // base, para que el texto sea legible sin depender del contenido de la foto.
  scrim: string
  // Color base (sin alpha) del panel CTA — el componente le aplica la opacidad
  // de respaldo, igual para todos los temas.
  glassTint: string
  // Fuente del título — mismo criterio que el override de h1 en templates.css
  // (Cinzel en Graduación, Playfair Display en Bodas, etc.), explícito acá
  // porque el share card no consume esa cascada CSS.
  headerFontFamily: string
  // Solo Fiesta improvisada usa un resplandor sutil de neón en el título.
  headerTextShadow?: string
}

const DEFAULT_RECIPE: ShareRecipe = {
  backgroundGradient: 'linear-gradient(160deg, var(--share-accent), var(--share-accent-dark))',
  scrim: 'linear-gradient(to top, rgba(0,0,0,.82) 0%, rgba(0,0,0,.35) 45%, rgba(0,0,0,0) 68%)',
  glassTint: '#000000',
  headerFontFamily: 'inherit',
}

export const SHARE_RECIPES: Partial<Record<TemplateId, ShareRecipe>> = {
  wedding: {
    ...DEFAULT_RECIPE,
    headerFontFamily: "'Cormorant Garamond', Georgia, serif",
    glassTint: '#4a3b32',
    scrim: 'linear-gradient(to top, rgba(74,44,20,.85) 0%, rgba(74,44,20,.3) 45%, rgba(0,0,0,0) 68%)',
  },
  cowboy: {
    ...DEFAULT_RECIPE,
    headerFontFamily: "'Rye', Georgia, serif",
    glassTint: '#3d2410',
  },
  graduation: {
    ...DEFAULT_RECIPE,
    headerFontFamily: "'EB Garamond', Georgia, serif",
    glassTint: '#152a63',
  },
  formal: {
    ...DEFAULT_RECIPE,
    headerFontFamily: "'Space Grotesk', system-ui, sans-serif",
    glassTint: '#20242b',
  },
  kids: {
    ...DEFAULT_RECIPE,
    headerFontFamily: "'Baloo 2', system-ui, sans-serif",
    glassTint: '#5a4133',
  },
  houseparty: {
    ...DEFAULT_RECIPE,
    headerFontFamily: "'Space Grotesk', system-ui, sans-serif",
    headerTextShadow: '0 0 18px rgba(34,211,238,.35)',
    glassTint: '#150F24',
    scrim: 'linear-gradient(to top, rgba(11,7,20,.9) 0%, rgba(11,7,20,.4) 45%, rgba(0,0,0,0) 68%)',
  },
}

export function getShareRecipe(id?: TemplateId | string): ShareRecipe {
  return SHARE_RECIPES[id as TemplateId] ?? DEFAULT_RECIPE
}
