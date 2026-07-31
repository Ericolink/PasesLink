import { useState } from 'react'
import { uploadImage } from '../utils/cloudinary'
import { usePickAndCropImage } from './usePickAndCropImage'

// Copia casi literal de useCoverPhoto.ts para la foto de un ítem del
// catálogo de concessions — mismo flujo (elegir → recortar → subir a
// Cloudinary), pero recorte cuadrado (1:1, ver ConcessionItemFormModal) en
// vez del 16:9 de la portada del evento.
export function useConcessionItemPhoto(initial = '') {
  const [imageUrl, setImageUrl] = useState(initial)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const { fileInputRef, rawImage, error, openPicker, onFileSelected, onCropConfirmed, onCropCancelled } =
    usePickAndCropImage(async (blob) => {
      setUploading(true)
      try {
        const url = await uploadImage(blob)
        setImageUrl(url)
      } catch {
        setUploadError('No pudimos subir la imagen. Verifica que sea menor de 8 MB.')
      } finally {
        setUploading(false)
      }
    })

  function clearImage() {
    setImageUrl('')
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError('')
    onFileSelected(e)
  }

  return {
    fileInputRef,
    imageUrl,
    rawImage,
    uploading,
    error: error || uploadError,
    openPicker,
    onFileSelected: handleFileSelected,
    onCropConfirmed,
    onCropCancelled,
    clearImage,
    setImageUrl,
  }
}
