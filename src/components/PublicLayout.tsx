import type { ReactNode } from 'react'
import { Navbar } from './Navbar'
import { Footer } from './Footer'

// Chrome de marketing/legal/auth: Navbar arriba + Footer abajo, igual que
// antes del rediseño de navegación. No lleva BottomTabBar — esas páginas
// son públicas o previas al login.
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main>{children}</main>
      <Footer />
    </>
  )
}
