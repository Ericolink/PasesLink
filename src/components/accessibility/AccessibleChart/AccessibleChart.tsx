import type { ReactNode } from 'react'

interface AccessibleChartProps {
  /** Alternativa textual completa (pico, total, promedio, etc.) — un lector
      de pantalla no puede "ver la forma" del gráfico, así que esto hace de
      contenido real; los números/barras de `children` son un agregado
      visual, no un reemplazo. */
  summary: string
  /** Título corto y visible debajo del gráfico (ej. "Hora del día"). */
  caption: string
  /** Las barras/columnas del gráfico — deben llevar `aria-hidden="true"` en
      el nivel que las contiene (ver EventAnalytics/Admin/ControlCenter/charts): con
      `summary` ya cubriendo el contenido, un lector de pantalla no debe
      además leer cada barra suelta. */
  children: ReactNode
  className?: string
}

// Extrae el patrón figure/figcaption/role=img que ya estaba probado en
// EventAnalytics.tsx — pensado para gráficos donde el valor de cada barra
// NO es texto visible en orden de lectura (aquí, solo altura/color). Si el
// gráfico ya expone cada valor como texto adyacente y legible en orden (ver
// la lista "Llegadas por hora" de Reports.tsx, con su propia nota), NO usar
// este wrapper — envolverlo en role="img" ocultaría contenido que ya es
// accesible tal cual; ahí conviene reforzar con role="progressbar" por ítem
// en vez de un role="img" de bloque.
export function AccessibleChart({ summary, caption, children, className = '' }: AccessibleChartProps) {
  return (
    <figure className={`m-0 ${className}`}>
      <div role="img" aria-label={summary} className="overflow-x-auto -mx-1 px-1">
        {children}
      </div>
      <figcaption className="text-2xs text-gray-400 text-center mt-1">{caption}</figcaption>
    </figure>
  )
}
