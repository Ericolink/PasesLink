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
      <main className={mode === 'browse' ? 'pb-16 sm:pb-0' : ''}>{children}</main>
      {mode === 'browse' && <BottomTabBar />}
    </>
  )
}
