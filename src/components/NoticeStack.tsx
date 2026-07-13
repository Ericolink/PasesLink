import type { ReactNode } from 'react'

// Agrupa varios <InlineNotice grouped> bajo un solo borde/fondo con
// divisores internos. Estrategia de agrupación para cuando dos avisos
// (navegador integrado + multi-dispositivo, en GuestPass) pueden aparecer a
// la vez: sin esto cada uno trae su propio borde+fondo+margen y se come el
// doble del alto de viewport que el contenido realmente necesita. Se usa
// solo cuando hay 2+ avisos visibles — con uno solo, InlineNotice ya se
// muestra suelto (grouped=false) tal como antes.
export function NoticeStack({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-lg border border-[var(--invite-border)] bg-[var(--invite-surface)] divide-y divide-[var(--invite-border)] overflow-hidden">
      {children}
    </div>
  )
}
