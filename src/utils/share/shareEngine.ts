import type { ShareCardContent } from './types'

export type ShareResult = 'shared' | 'shared-no-image' | 'unsupported'

// Motor de share desacoplado del contenido: cualquier ShareCardContent
// (evento hoy, recordatorio/promo/invitación individual a futuro) pasa por
// el mismo camino en cascada:
//
// 1. Web Share API nivel 2 con imagen adjunta (navigator.canShare + files) —
//    el más nativo posible: en Android/iOS abre la hoja de compartir del
//    sistema, e Instagram aparece como destino si está instalado (el usuario
//    elige Historia o Feed ya dentro de la app).
// 2. Web Share API sin imagen (navegadores que soportan share pero no files)
//    — mismo patrón que PublicLink.share/GuestList.handleShare ya usan hoy.
// 3. 'unsupported': no hay Web Share API en absoluto (típicamente desktop) —
//    el llamador debe abrir la hoja de respaldo (ShareFallbackSheet).
export async function shareEventCard(content: ShareCardContent, imageBlob: Blob | null): Promise<ShareResult> {
  const shareData = { title: content.title, text: content.ctaLabel, url: content.url }

  if (imageBlob && navigator.canShare && navigator.share) {
    const file = new File([imageBlob], 'evento-paselink.png', { type: 'image/png' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ ...shareData, files: [file] })
        return 'shared'
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'shared'
        console.error('Error compartiendo con imagen, se intenta sin imagen:', err)
      }
    }
  }

  if (navigator.share) {
    try {
      await navigator.share(shareData)
      return 'shared-no-image'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared-no-image'
      console.error('Error compartiendo sin imagen:', err)
    }
  }

  return 'unsupported'
}
