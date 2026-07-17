import type { ReactNode } from 'react'

type FooterPadding = 'default' | 'compact'

// Dos presets completos (no parciales) a propósito: Tailwind ordena las
// utilidades de padding por escala ascendente en el CSS generado, así que un
// override parcial como className="pt-1" NUNCA le gana a un "pt-4" ya
// presente en el string por defecto (pt-1 sale primero en el stylesheet,
// pt-4 después, y con la misma especificidad gana el que sale después) —
// verificado contra el CSS compilado. Un preset completo evita esa trampa:
// nunca conviven dos utilidades del mismo eje compitiendo por el cascade.
const PADDING_CLASS: Record<FooterPadding, string> = {
  default: 'p-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6',
  // Para modales con contenido scrolleable propio arriba (ReportModal) que
  // ya reservan su propio aire — el footer no necesita repetirlo.
  compact: 'px-6 pt-1 pb-4',
}

// Contenedor de acciones al pie de un Modal — fija el padding/gap/safe-area
// que antes variaba archivo por archivo (ver hallazgo B9/C6). Los botones en
// sí (variant/tamaño) siguen siendo decisión del caller vía <Button>.
export function DialogFooter({ children, padding = 'default', className = '' }: { children: ReactNode; padding?: FooterPadding; className?: string }) {
  return (
    <div className={`shrink-0 flex gap-3 ${PADDING_CLASS[padding]} ${className}`}>
      {children}
    </div>
  )
}
