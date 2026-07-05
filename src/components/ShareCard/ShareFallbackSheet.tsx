import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalA11y } from '../../hooks/useModalA11y'
import type { ShareCardContent } from '../../utils/share/types'
import { IconCheck, IconCopy, IconDownload, IconFacebook, IconTelegram, IconTwitterX, IconWhatsApp, IconX } from '../Icons'

// Respaldo para cuando Web Share API no existe (típicamente desktop) o el
// usuario quiere ver más opciones aunque el share nativo sí esté disponible:
// mismos web-intents ya usados en otras partes del proyecto (WhatsApp en
// GuestPass/EventDetail), sin SDKs, más descarga de imagen y copiar enlace.
// Garantiza que siempre haya una alternativa para compartir.
export function ShareFallbackSheet({
  open,
  content,
  imageUrl,
  onClose,
}: {
  open: boolean
  content: ShareCardContent
  imageUrl: string | null
  onClose: () => void
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(open, onClose)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const shareText = `${content.title} — ${content.ctaLabel}`
  const encodedUrl = encodeURIComponent(content.url)
  const encodedText = encodeURIComponent(shareText)

  const networks = [
    { label: 'WhatsApp', icon: IconWhatsApp, color: '#25D366', href: `https://wa.me/?text=${encodedText}%20${encodedUrl}` },
    { label: 'Telegram', icon: IconTelegram, color: '#26A5E4', href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
    { label: 'Facebook', icon: IconFacebook, color: '#1877F2', href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: 'X', icon: IconTwitterX, color: '#000000', href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}` },
  ]

  async function handleCopy() {
    await navigator.clipboard.writeText(content.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Compartir evento"
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm animate-bounce-in"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Compartir evento</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-5">
          {imageUrl && (
            <div className="flex justify-center mb-4">
              <img src={imageUrl} alt="Vista previa de la historia" className="h-52 rounded-xl border border-gray-200 dark:border-gray-700" />
            </div>
          )}

          {imageUrl && (
            <a
              href={imageUrl}
              download="evento-paselink.png"
              className="flex items-center justify-center gap-2 w-full bg-primary text-white rounded-xl py-2.5 text-sm font-medium hover:opacity-90 transition-opacity mb-3"
            >
              <IconDownload className="w-4 h-4" /> Descargar imagen
            </a>
          )}

          <div className="grid grid-cols-4 gap-2 mb-3">
            {networks.map(({ label, icon: Icon, color, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title={label}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
              >
                <span style={{ color }}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-[11px] text-gray-600 dark:text-gray-300">{label}</span>
              </a>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 w-full border border-gray-300 dark:border-gray-600 rounded-xl py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {copied ? <IconCheck className="w-4 h-4" /> : <IconCopy className="w-4 h-4" />}
            {copied ? 'Copiado ✓' : 'Copiar enlace'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
