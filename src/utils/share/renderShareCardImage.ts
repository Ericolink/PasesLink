// Genera la imagen compartible (PNG 1080x1920, formato Historia de
// Instagram) capturando el DOM real de EventShareCardTemplate con
// html-to-image — mismo enfoque y mismas salvaguardas que downloadPass.ts
// para el pase individual, pero con toBlob (no toPng/dataURL) porque
// Web Share API necesita un Blob/File, no un data URL.
import { toBlob } from 'html-to-image'

const PIXEL_RATIO = 4

function isExcluded(node: unknown): boolean {
  return node instanceof HTMLElement && node.dataset.shareCardExclude === 'true'
}

export async function renderShareCardImage(node: HTMLElement): Promise<Blob | null> {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  try {
    return await toBlob(node, {
      pixelRatio: PIXEL_RATIO,
      cacheBust: true,
      filter: (n) => !isExcluded(n),
    })
  } catch (err) {
    // Misma causa probable que en downloadPass.ts: una imagen de portada
    // externa (Cloudinary) tainteando el canvas por CORS. Se reintenta sin
    // imágenes para que el usuario igual se lleve una imagen compartible
    // (sin foto de portada) en vez de un error duro.
    console.error('Error generando la imagen para compartir, reintentando sin imágenes:', err)
    try {
      return await toBlob(node, {
        pixelRatio: PIXEL_RATIO,
        cacheBust: true,
        filter: (n) => !isExcluded(n) && !(n instanceof HTMLImageElement),
      })
    } catch (retryErr) {
      console.error('No se pudo generar la imagen para compartir:', retryErr)
      return null
    }
  }
}
