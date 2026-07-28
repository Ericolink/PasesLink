// Contraste de texto sobre un color de acento arbitrario (Feature 2:
// personalización de plantillas — el organizador puede elegir cualquier
// accentColor, y un acento claro con texto blanco hardcodeado rompe
// legibilidad). Se CALCULA en vez de guardarse en Firestore: accentColor ya
// vive en el cliente donde se necesita, así que persistir un campo derivado
// solo agregaría una fuente más de staleness (¿qué pasa si accentColor
// cambia pero el campo derivado no se recalcula?) sin ningún beneficio real.
//
// Fórmula de luminancia relativa WCAG 2.x (misma que ya se usó a mano en la
// auditoría de accesibilidad de las plantillas, ver comentarios en
// registry.ts sobre contraste 4.5:1) — un color se considera "claro" cuando
// pasa mejor contraste con texto oscuro que con texto blanco.
function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const int = parseInt(match[1], 16)
  const channel = (shift: number) => {
    const c = ((int >> shift) & 0xff) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

// Texto oscuro editorial (no #000 puro) para acompañar acentos claros —
// mismo criterio "casi negro, no tinta pura" que ya usan los temas propios
// (ver `text` en registry.ts, ninguno usa #000000).
const DARK_TEXT = '#1a1a1a'
const LIGHT_TEXT = '#ffffff'

// `fallback` cubre accentColor vacío/inválido (evento sin accentColor
// propio, todavía usando el de la plantilla) — blanco es el comportamiento
// histórico antes de que existiera esta función, así que es el default
// seguro para no cambiar look-and-feel de eventos existentes.
export function getAccentContrastText(hex: string | undefined, fallback: string = LIGHT_TEXT): string {
  if (!hex) return fallback
  const luminance = relativeLuminance(hex)
  if (luminance == null) return fallback
  // Umbral 0.5 (no el 0.179 "exacto" de cruce de contraste 4.5:1 con blanco
  // puro): a esta escala de botón (texto corto, tamaño grande) alcanza con
  // la heurística simple de "¿es un color claro o uno oscuro?" — el mismo
  // criterio que usan la mayoría de generadores de paleta accesibles.
  return luminance > 0.5 ? DARK_TEXT : LIGHT_TEXT
}
