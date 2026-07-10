import { useState } from 'react'
import { IconGlobe, IconX } from './Icons'
import { detectInAppBrowser, buildAndroidChromeIntentUrl } from '../utils/inAppBrowser'

// Aviso no bloqueante para cuando el pase se abre desde el navegador interno
// de una app (Instagram, TikTok, WhatsApp, etc.) — ese storage aislado es la
// causa más común de que un mismo invitado "acumule" dispositivos al abrir
// el mismo link desde apps distintas (ver claimGuestPass). Se descarta
// solo si Android puede resolverlo con una redirección directa a Chrome; en
// iOS no hay forma de forzarlo desde JS, así que se ofrece copiar el enlace.
export function InAppBrowserBanner() {
  const [dismissed, setDismissed] = useState(false)
  const { isInApp, appName } = detectInAppBrowser(navigator.userAgent)
  const [copied, setCopied] = useState(false)

  if (!isInApp || dismissed) return null

  const intentUrl = buildAndroidChromeIntentUrl(window.location.href, navigator.userAgent)

  function handleAction() {
    if (intentUrl) {
      window.location.href = intentUrl
      return
    }
    navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true))
  }

  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left text-sm"
      style={{ borderColor: 'var(--invite-border)', background: 'var(--invite-surface)' }}
    >
      <IconGlobe className="w-4 h-4 mt-0.5 flex-shrink-0 text-[var(--invite-accent)]" />
      <div className="flex-1">
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
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Cerrar aviso"
        className="text-[var(--invite-text-muted)] hover:text-[var(--invite-text)]"
      >
        <IconX className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
