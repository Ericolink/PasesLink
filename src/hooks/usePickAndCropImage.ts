import { useRef, useState } from 'react'
import { MAX_UPLOAD_MB } from '../utils/cloudinary'

// Extrae el paso "elegir archivo → validar → leer a dataURL → sostener hasta
// que el recorte se confirme o cancele", compartido por la portada de evento
// (useCoverPhoto) y las 3 pantallas de foto de perfil. No decide qué hacer
// con el blob final (subir ya o guardar para más tarde) — eso queda en
// `onCropped`, ya que cada consumidor lo maneja distinto.
export function usePickAndCropImage(onCropped: (blob: Blob) => void) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rawImage, setRawImage] = useState<string | null>(null)
  const [error, setError] = useState('')

  function openPicker() {
    fileInputRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Elige un archivo de imagen (JPG, PNG, WEBP, etc.).')
      return
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`La imagen no puede superar los ${MAX_UPLOAD_MB} MB.`)
      return
    }

    setError('')
    const reader = new FileReader()
    reader.onload = (ev) => setRawImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function onCropCancelled() {
    setRawImage(null)
  }

  function onCropConfirmed(blob: Blob) {
    setRawImage(null)
    onCropped(blob)
  }

  return { fileInputRef, rawImage, error, openPicker, onFileSelected, onCropConfirmed, onCropCancelled }
}
