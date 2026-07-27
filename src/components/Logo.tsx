// className controla la altura (y cualquier margen extra) — el default cubre
// el tamaño de siempre; los llamadores que necesitan otro tamaño pasan su
// propia clase de altura, que reemplaza el default en vez de competir con él
// (antes "h-9" se concatenaba siempre antes del className del llamador, y
// cuál de las dos clases de altura ganaba dependía del orden en que Tailwind
// las generaba, no de la intención del código).
//
// El logo es negro puro sobre transparencia — necesita invertirse a blanco
// según qué hay DETRÁS, y "detrás" no siempre es el tema de la app:
// - 'auto' (default): logo-glow — negro en claro, blanco+halo en oscuro.
//   Para Navbar/WelcomeModal, que viven sobre superficies que sí siguen el
//   tema de la app.
// - 'fixed': logo-glow-fixed — blanco siempre. Para Footer, cuyo fondo es
//   oscuro fijo en los dos temas (no sigue el toggle).
// - 'invite': logo-glow-invite — negro por defecto, blanco solo dentro de
//   [data-template='houseparty']. Para GuestPassTicket, que vive dentro de
//   InvitationThemeRoot: ahí "detrás" es --invite-surface, que varía por
//   plantilla de evento (6 de 7 son superficies claras, solo houseparty es
//   oscura) y no tiene relación con el tema claro/oscuro de la app.
type LogoVariant = 'auto' | 'fixed' | 'invite'

const VARIANT_CLASS: Record<LogoVariant, string> = {
  auto: 'logo-glow',
  fixed: 'logo-glow-fixed',
  invite: 'logo-glow-invite',
}

export function Logo({ className = 'h-9', variant = 'auto' }: { className?: string; variant?: LogoVariant }) {
  return (
    <img
      src="/Logo.png"
      alt="PaseLink"
      className={`w-auto ${VARIANT_CLASS[variant]} ${className}`}
    />
  )
}
