import type { Area } from 'react-easy-crop'
import { UPLOAD_JPEG_QUALITY } from './cloudinary'

interface CropOptions {
  // Lado más largo del recorte final, en píxeles — evita subir un blob
  // gigante cuando el usuario recorta con zoom bajo sobre una foto de
  // altísima resolución (la cámara del celular, no el recorte, define el
  // tamaño de `area`).
  maxDimension: number
  quality?: number
}

export async function cropImageToBlob(imageSrc: string, area: Area, { maxDimension, quality = UPLOAD_JPEG_QUALITY }: CropOptions): Promise<Blob> {
  const img = await loadImage(imageSrc)
  const scale = Math.min(1, maxDimension / Math.max(area.width, area.height))
  const outWidth = Math.max(1, Math.round(area.width * scale))
  const outHeight = Math.max(1, Math.round(area.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = outWidth
  canvas.height = outHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, outWidth, outHeight)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo procesar la imagen'))
    }, 'image/jpeg', quality)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
