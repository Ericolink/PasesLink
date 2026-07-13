import type { ReactNode } from 'react'
import { BottomTabBar } from './BottomTabBar'

export type AppShellMode = 'browse' | 'focus' | 'kiosk'

type AppShellProps = {
  /**
   * "browse"  — pantallas de recorrido: Inicio, Invitaciones, Perfil, detalle
   *             de evento, reportes, admin. Barra inferior siempre visible.
   * "focus"   — flujos de varios pasos que no deben abandonarse sin darse
   *             cuenta (crear evento). Sin barra inferior, con salida explícita.
   * "kiosk"   — pantallas operadas bajo presión (escanear en la puerta, pase
   *             público de un invitado). Chrome mínimo a propósito.
   */
  mode?: AppShellMode
  children: ReactNode
}

export function AppShell({ mode = 'browse', children }: AppShellProps) {
  return (
    <>
      {/* pb-16 alcanzaba para la altura "normal" de BottomTabBar, pero esa
          barra suma env(safe-area-inset-bottom) (~34px en iPhones con Home
          Indicator) por encima de esa altura — sin sumarlo acá también, el
          último elemento de pantallas con poco margen propio al final
          (Perfil, Feedback) quedaba tapado por la porción de la barra que
          vive en la safe area. */}
      {/* padding lateral en las 3 variantes (no solo "browse"): en landscape
          en un dispositivo con notch, el contenido pegado al borde puede
          quedar tapado por él — antes solo se protegía el borde inferior. */}
      <main
        className={mode === 'browse' ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0' : ''}
        style={{ paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}
      >
        {children}
      </main>
      {mode === 'browse' && <BottomTabBar />}
    </>
  )
}
