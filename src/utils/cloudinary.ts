const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
const MAX_FILE_SIZE_MB = 5

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
