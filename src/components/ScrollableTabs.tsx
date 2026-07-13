import type { ReactNode } from 'react'

// Contenedor de tabs/segmented-control con scroll horizontal propio — antes
// AdminDashboard.tsx (5 tabs) y GuestAddForm.tsx (3 modos) usaban un simple
// `flex gap-2` sin wrap ni scroll: en pantallas angostas, la fila desbordaba
// el contenedor (scroll horizontal de la PÁGINA, o botones cortados) en vez
// de scrollear solo la tira de tabs. `-mx-4 px-4` deja que la tira sangre
// hasta el borde real de la pantalla en mobile (más lugar para los tabs)
// aunque el padre tenga padding — cada caller sigue renderizando sus propios
// botones tal cual, esto solo estandariza el contenedor.
export function ScrollableTabs({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      {children}
    </div>
  )
}
