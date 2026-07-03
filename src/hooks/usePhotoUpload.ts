import { useRef, useState } from 'react'
import { addPhoto } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { uploadImage, resizeImageForUpload } from '../utils/cloudinary'

export const PHOTO_CAPTION_MAX = 120
const MAX_FILE_MB = 8

export function usePhotoUpload(
  eventId: string,
  authorName: string,
  authorToken: string,
  onUploaded?: () => void,
) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [caption, setCaption] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function openPicker() {
    fileRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setUploadError(`La foto no puede superar los ${MAX_FILE_MB} MB.`)
      return
    }
    setUploadError('')
    setCaption('')
    setPendingFile(file)
  }

  function cancelUpload() {
    setPendingFile(null)
  }

  async function confirmUpload() {
    if (!pendingFile) return
    setPendingFile(null)
    setUploading(true)
    setUploadError('')
    try {
      const optimized = await resizeImageForUpload(pendingFile)
      const url = await uploadImage(optimized)
      await addPhoto(eventId, {
        url,
        authorName,
        authorToken,
        caption: caption.trim() || undefined,
      } as Omit<PhotoData, 'id' | 'createdAt'>)
      onUploaded?.()
    } catch {
      setUploadError('No se pudo subir la foto. Intenta de nuevo.')
    } finally {
      setUploading(false)
      setCaption('')
    }
  }

  return {
    fileRef,
    uploading,
    uploadError,
    caption,
    setCaption,
    pendingFile,
    openPicker,
    onFileSelected,
    confirmUpload,
    cancelUpload,
  }
}
