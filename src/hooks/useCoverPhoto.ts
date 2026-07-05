import { useState } from 'react'
import { uploadImage } from '../utils/cloudinary'
import { usePickAndCropImage } from './usePickAndCropImage'

export function useCoverPhoto(initial = '') {
  const [coverImage, setCoverImage] = useState(initial)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const { fileInputRef, rawImage, error, openPicker, onFileSelected, onCropConfirmed, onCropCancelled } =
    usePickAndCropImage(async (blob) => {
      setUploading(true)
      try {
        const url = await uploadImage(blob)
        setCoverImage(url)
      } catch {
        setUploadError(`No pudimos subir la imagen. Verifica que sea menor de 8 MB.`)
      } finally {
        setUploading(false)
      }
    })

  function clearCover() {
    setCoverImage('')
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError('')
    onFileSelected(e)
  }

  return {
    fileInputRef,
    coverImage,
    rawImage,
    uploading,
    error: error || uploadError,
    openPicker,
    onFileSelected: handleFileSelected,
    onCropConfirmed,
    onCropCancelled,
    clearCover,
    setCoverImage,
  }
}
