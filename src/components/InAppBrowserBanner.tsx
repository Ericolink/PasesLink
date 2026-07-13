import { IconGlobe } from './Icons'
import { InlineNotice } from './InlineNotice'
import { useInAppBrowserNotice } from '../hooks/useInAppBrowserNotice'

interface Props {
  /** true cuando se renderiza dentro de un <NoticeStack> junto a otro aviso. */
  grouped?: boolean
}

// Aviso no bloqueante para cuando el pase se abre desde el navegador interno
// de una app (Instagram, TikTok, WhatsApp, etc.) — ese storage aislado es la
// causa más común de que un mismo invitado "acumule" dispositivos al abrir
// el mismo link desde apps distintas (ver claimGuestPass). Se descarta
// solo si Android puede resolverlo con una redirección directa a Chrome; en
// iOS no hay forma de forzarlo desde JS, así que se ofrece copiar el enlace.
export function InAppBrowserBanner({ grouped = false }: Props) {
  const { visible, appName, intentUrl, copied, dismiss, handleAction } = useInAppBrowserNotice()

  if (!visible) return null

  return (
    <InlineNotice
      grouped={grouped}
      onDismiss={dismiss}
      icon={<IconGlobe className="w-4 h-4 text-[var(--invite-accent)]" />}
    >
      <p className="text-[var(--invite-text)]">Estás viendo esto desde el navegador de {appName}.</p>
      <p className="mt-0.5 text-[var(--invite-text-muted)]">
        {intentUrl
          ? 'Para una mejor experiencia, abrí el pase en Chrome.'
          : 'Para una mejor experiencia, tocá el menú ••• y elegí "Abrir en el navegador", o copiá el enlace y pegalo en Safari/Chrome.'}
      </p>
      <button
        type="button"
        onClick={handleAction}
        className="mt-1.5 text-xs font-medium underline underline-offset-2 text-[var(--invite-accent)]"
      >
        {intentUrl ? 'Abrir en Chrome' : copied ? 'Enlace copiado' : 'Copiar enlace'}
      </button>
    </InlineNotice>
  )
}
