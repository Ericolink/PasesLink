import { useState } from 'react'
import type { ShareCardContent } from '../../utils/share/types'
import { IconCheck, IconCopy, IconDownload, IconFacebook, IconTelegram, IconTwitterX, IconWhatsApp } from '../Icons'
import { Modal } from '../Modal'
import { DialogHeader } from '../DialogHeader'
import { Button } from '../Button'

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
  const [copied, setCopied] = useState(false)

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

  return (
    <Modal open={open} onClose={onClose} label="Compartir evento">
      <DialogHeader title="Compartir evento" onClose={onClose} />

      <div className="px-5 pb-5 pt-4 overflow-y-auto">
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
              <span className="text-2xs text-gray-600 dark:text-gray-300">{label}</span>
            </a>
          ))}
        </div>

        <Button variant="secondary" onClick={handleCopy} className="w-full flex items-center justify-center gap-2">
          {copied ? <IconCheck className="w-4 h-4" /> : <IconCopy className="w-4 h-4" />}
          {copied ? 'Copiado ✓' : 'Copiar enlace'}
        </Button>
      </div>
    </Modal>
  )
}
