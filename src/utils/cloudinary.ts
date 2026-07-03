const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
const MAX_FILE_SIZE_MB = 5

// Umbrales de resizeImageForUpload — ver ese comentario para el porqué.
const MAX_UPLOAD_DIMENSION = 1600
const UPLOAD_JPEG_QUALITY = 0.82
const SKIP_RESIZE_UNDER_BYTES = 400 * 1024

/**
 * Redimensiona/recomprime una foto en el navegador ANTES de subirla — pensado
 * para el muro de fotos (PhotoSection.tsx), donde un evento puede terminar
 * con cientos de fotos de celular (varios MB cada una, típico de una cámara
 * moderna) subidas por decenas de invitados a la vez. Sin esto, cada foto
 * viaja completa hasta Cloudinary y de ahí a cada persona que abre la
 * galería — con 200+ fotos eso es mucho ancho de banda y tiempo de subida
 * en el wifi del salón, además de acercarse más rápido a los límites del
 * plan gratuito de Cloudinary. `optimizedImageUrl` ya sirve versiones
 * livianas al MOSTRAR una foto, pero eso no evita subir el original pesado
 * primero.
 *
 * Nunca bloquea la subida: si `createImageBitmap`/canvas fallan por lo que
 * sea (navegador viejo, formato raro), se sube el archivo original tal cual
 * — el resize es una optimización, no un requisito. Los GIF se excluyen
 * (perderían la animación al pasar por canvas) y los archivos ya livianos
 * (< 400 KB) se suben sin tocar, para no gastar CPU del celular del
 * invitado en algo que no hace falta.
 */
export async function resizeImageForUpload(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.size <= SKIP_RESIZE_UNDER_BYTES) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY))
    // Una foto ya muy comprimida a veces "pesa más" en JPEG re-codificado —
    // en ese caso no tiene sentido reemplazarla.
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

export async function uploadImage(file: File | Blob): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary no está configurado.')
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`La imagen no puede superar los ${MAX_FILE_SIZE_MB} MB.`)
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', UPLOAD_PRESET)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('No se pudo subir la imagen.')
  }

  const data = await response.json()
  return data.secure_url as string
}

/**
 * Si la URL es de Cloudinary, inserta transformaciones (calidad/formato
 * automático + ancho máximo) para servir una versión más liviana en vez del
 * original. URLs que no son de Cloudinary (ej. foto de Google/Facebook) se
 * devuelven sin cambios.
 */
export function optimizedImageUrl(url: string, width: number): string {
  if (!url) return url
  const marker = '/upload/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const insertAt = idx + marker.length
  return `${url.slice(0, insertAt)}q_auto,f_auto,w_${width}/${url.slice(insertAt)}`
}
