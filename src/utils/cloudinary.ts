const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

// Único límite de tamaño para todo el flujo (antes había dos valores
// distintos entre este archivo y usePhotoUpload.ts: si el resize fallaba
// -navegador viejo, formato raro- un archivo aceptado por el hook podía
// rebotar igual acá con un límite más bajo).
export const MAX_UPLOAD_MB = 8

// Umbrales de resizeImageForUpload — ver ese comentario para el porqué.
const MAX_UPLOAD_DIMENSION = 1600
// Exportada: la reusa src/utils/imageCrop.ts para que el recorte de portada/
// avatar salga con la misma calidad que el resto de las imágenes subidas.
export const UPLOAD_JPEG_QUALITY = 0.82
const SKIP_RESIZE_UNDER_BYTES = 400 * 1024

export interface PreparedUpload {
  blob: Blob
  // Dimensiones del blob final (ya escalado si hubo resize) — se guardan en
  // Firestore junto a la foto para que el feed pueda reservar el alto de la
  // tarjeta antes de que la imagen cargue (evita el salto de layout típico
  // de <img> sin tamaño intrínseco). Quedan undefined solo si el navegador
  // no pudo decodificar la imagen (ver catch más abajo) — el resize/subida
  // sigue funcionando igual, solo sin aspect-ratio conocido de antemano.
  width?: number
  height?: number
}

/**
 * Redimensiona/recomprime una foto en el navegador ANTES de subirla — pensado
 * para el muro de fotos (usePhotoUpload.ts), donde un evento puede terminar
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
 * (perderían la animación al pasar por canvas). Los archivos ya livianos
 * (< 400 KB) igual se decodifican (una sola vez) para conocer sus
 * dimensiones, pero se suben sin volver a codificarlos — no hace falta
 * gastar CPU del celular del invitado en un re-encode que no ahorra peso.
 */
export async function resizeImageForUpload(file: File): Promise<PreparedUpload> {
  if (file.type === 'image/gif') return { blob: file }
  try {
    const bitmap = await createImageBitmap(file)
    const rawWidth = bitmap.width
    const rawHeight = bitmap.height

    if (file.size <= SKIP_RESIZE_UNDER_BYTES) {
      bitmap.close()
      return { blob: file, width: rawWidth, height: rawHeight }
    }

    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(rawWidth, rawHeight))
    const width = Math.max(1, Math.round(rawWidth * scale))
    const height = Math.max(1, Math.round(rawHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return { blob: file, width: rawWidth, height: rawHeight }
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY))
    // Una foto ya muy comprimida a veces "pesa más" en JPEG re-codificado —
    // en ese caso no tiene sentido reemplazarla.
    if (blob && blob.size < file.size) return { blob, width, height }
    return { blob: file, width: rawWidth, height: rawHeight }
  } catch {
    return { blob: file }
  }
}

// Errores de red/servidor (5xx, timeout, sin conexión) ameritan reintento
// automático — un 4xx (archivo inválido, preset mal configurado) no, porque
// reintentar no va a cambiar el resultado.
class RetryableUploadError extends Error {}

const UPLOAD_TIMEOUT_MS = 30_000
const MAX_UPLOAD_RETRIES = 2
const RETRY_BASE_DELAY_MS = 600

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function uploadOnce(file: File | Blob, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`)
    xhr.timeout = UPLOAD_TIMEOUT_MS

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          resolve(data.secure_url as string)
        } catch {
          reject(new Error('No se pudo subir la imagen.'))
        }
      } else if (xhr.status >= 500) {
        reject(new RetryableUploadError())
      } else {
        reject(new Error('No se pudo subir la imagen.'))
      }
    }
    xhr.onerror = () => reject(new RetryableUploadError())
    xhr.ontimeout = () => reject(new RetryableUploadError())

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', UPLOAD_PRESET)
    xhr.send(formData)
  })
}

/**
 * Sube la imagen a Cloudinary con reintentos automáticos ante fallas de red
 * o del servidor (típico en el wifi congestionado de un salón de eventos con
 * decenas de invitados subiendo fotos a la vez). `onProgress` reporta 0-100
 * en base al progreso real de la subida (XHR), no un estimado.
 */
export async function uploadImage(file: File | Blob, onProgress?: (pct: number) => void): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary no está configurado.')
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`La imagen no puede superar los ${MAX_UPLOAD_MB} MB.`)
  }

  for (let attempt = 0; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      return await uploadOnce(file, onProgress)
    } catch (err) {
      const isLastAttempt = attempt === MAX_UPLOAD_RETRIES
      if (!(err instanceof RetryableUploadError) || isLastAttempt) {
        throw err instanceof RetryableUploadError
          ? new Error('No se pudo subir la foto. Revisa tu conexión e intenta de nuevo.')
          : err
      }
      onProgress?.(0)
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt)
    }
  }
  // Inalcanzable (el loop siempre retorna o lanza), solo para TypeScript.
  throw new Error('No se pudo subir la foto.')
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
  return `${url.slice(0, insertAt)}q_auto,f_auto,dpr_auto,w_${width}/${url.slice(insertAt)}`
}

/**
 * Versión diminuta y borrosa de la misma imagen (transform `e_blur`), pensada
 * como placeholder mientras carga la versión real — pesa unos pocos KB así
 * que aparece casi instantáneo incluso en redes lentas, evitando el
 * "parpadeo" de un cuadro vacío/gris.
 */
export function blurPlaceholderUrl(url: string): string {
  if (!url) return url
  const marker = '/upload/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url
  const insertAt = idx + marker.length
  return `${url.slice(0, insertAt)}q_1,f_auto,w_24,e_blur:1000/${url.slice(insertAt)}`
}
