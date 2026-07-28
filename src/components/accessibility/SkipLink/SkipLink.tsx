import type { ReactNode } from 'react'

interface SkipLinkProps {
  targetId?: string
  children?: ReactNode
}

// Reemplaza el <a className="skip-link"> que antes vivía duplicado, con el
// mismo texto exacto, en PublicLayout y AppShell (los únicos 2 layouts). Usa
// las utilidades sr-only/focus:not-sr-only de Tailwind en vez del bloque CSS
// custom .skip-link/.skip-link:focus (eliminado de index.css) — mismo
// comportamiento (invisible hasta recibir foco de teclado), sin depender de
// una clase que solo dos archivos conocían.
export function SkipLink({ targetId = 'main-content', children = 'Saltar al contenido' }: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only fixed top-2 left-2 z-[300] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
    >
      {children}
    </a>
  )
}
