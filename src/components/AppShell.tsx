import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BottomTabBar } from './BottomTabBar'
import { IconArrowLeft } from './Icons'
import { useAuth } from '../hooks/useAuth'

type AppShellMode = 'browse' | 'focus' | 'kiosk'

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
  /**
   * Solo aplica con mode="kiosk". Estas pantallas (GuestPass, EventJoin,
   * EventArrive, EventWall) son de entrada pública — se llega sin sesión la
   * mayoría de las veces, por eso no llevan Navbar/BottomTabBar. Pero
   * cualquiera de ellas puede terminar viéndola un usuario YA autenticado
   * (creó cuenta desde el mismo pase, o ya había iniciado sesión en otra
   * pestaña) y, sin esto, esa persona queda sin ningún link de vuelta al
   * resto de la app — la pantalla completa no tiene un solo <Link> ni
   * navigate() hacia /dashboard (verificado en los 4 componentes). Con
   * guestExit=true y sesión activa, se agrega esa única salida — nada
   * cambia para el invitado anónimo, que sigue viendo el chrome mínimo.
   * Scanner (el otro consumidor de mode="kiosk") deja esto en false a
   * propósito: para el operador en la puerta, kiosk sí debe ser una
   * pantalla sin salida mientras dura el evento.
   */
  guestExit?: boolean
  children: ReactNode
}

function KioskExitBar() {
  return (
    <div
      className="sticky top-0 z-40 border-b flex items-center h-12 px-4"
      style={{
        background: 'var(--app-chrome-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'var(--app-chrome-border)',
        paddingLeft: 'calc(1rem + env(safe-area-inset-left))',
        paddingRight: 'calc(1rem + env(safe-area-inset-right))',
      }}
    >
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors min-h-11"
      >
        <IconArrowLeft className="w-4 h-4" /> Volver a PaseLink
      </Link>
    </div>
  )
}

export function AppShell({ mode = 'browse', guestExit = false, children }: AppShellProps) {
  const { user } = useAuth()
  const showKioskExit = mode === 'kiosk' && guestExit && !!user

  return (
    <>
      {showKioskExit && <KioskExitBar />}
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
