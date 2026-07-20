import type { EventData } from '../types'
import { getTemplate } from '../templates/registry'

// Fuente única de verdad para llevar el tema visual de un evento
// (src/templates/registry.ts) a cualquier formato de exportación
// (PDF, Excel y lo que venga después) — evita que cada exportador reimplemente
// su propia conversión hex→RGB o su propio criterio de "esta plantilla es serif".
type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lighten([r, g, b]: Rgb, amount: number): Rgb {
  return [r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount].map(Math.round) as Rgb
}

// Plantillas serif (Boda, Graduación, Evento formal) usan una tipografía de
// titular con serifas en las exportaciones para evocar la misma sensación
// "editorial" que su tema web — ni jsPDF (14 fuentes núcleo) ni Excel
// (fuentes instaladas en la máquina del anfitrión) pueden usar las fuentes
// decorativas reales (Cormorant/Cinzel/Rye/EB Garamond/etc.), así que esto es
// la aproximación más cercana sin empotrar archivos de fuente externos.
const SERIF_TEMPLATES = new Set(['wedding', 'graduation', 'formal'])

export interface ExportPalette {
  isSerif: boolean
  hex: {
    accent: string
    accentDark: string
    accentSoft: string
    text: string
    textMuted: string
  }
  rgb: {
    headerBg: Rgb
    accent: Rgb
    text: Rgb
    muted: Rgb
    faint: Rgb
    cardBg: Rgb
    link: Rgb
  }
}

// Deriva la paleta de exportación a partir de la MISMA fuente de verdad que
// el tema web del evento, para que cualquier archivo exportado se sienta del
// mismo evento que la invitación digital en vez de usar siempre los mismos
// colores fijos sin importar la plantilla elegida.
export function getExportPalette(templateId?: EventData['templateId'] | string): ExportPalette {
  const template = getTemplate(templateId)
  const text = hexToRgb(template.vars.text)
  const muted = hexToRgb(template.vars.textMuted)
  return {
    isSerif: SERIF_TEMPLATES.has(template.id),
    hex: {
      accent: template.vars.accent,
      accentDark: template.vars.accentDark,
      accentSoft: template.vars.accentSoft,
      text: template.vars.text,
      textMuted: template.vars.textMuted,
    },
    rgb: {
      headerBg: hexToRgb(template.vars.accentDark),
      accent: hexToRgb(template.vars.accent),
      text,
      muted,
      faint: lighten(muted, 0.35),
      cardBg: hexToRgb(template.vars.accentSoft),
      link: hexToRgb(template.vars.accentDark),
    },
  }
}
