import type { ReactNode } from 'react'
import { Navbar } from './Navbar'
import { AppShell } from './AppShell'

// Inicio, Invitaciones, Perfil, detalle de evento, reportes, admin: Navbar
// arriba (desktop) + BottomTabBar abajo (mobile), sin Footer de marketing.
export function BrowseLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <AppShell mode="browse">{children}</AppShell>
    </>
  )
}
