import { useRef, useState } from 'react'
import { uploadImage } from '../utils/cloudinary'

export function useCoverPhoto(initial = '') {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [coverImage, setCoverImage] = useState(initial)
  const [rawImage, setRawImage] = useState<string | null>(null) // src for crop modal
  const [uploading, setUploading] = useState(false)

  function openPicker() {
    fileInputRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setRawImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function onCropConfirmed(blob: Blob) {
    setRawImage(null)
    setUploading(true)
    try {
      const url = await uploadImage(blob)
      setCoverImage(url)
    } finally {
      setUploading(false)
    }
  }

  function onCropCancelled() {
    setRawImage(null)
  }

  function clearCover() {
    setCoverImage('')
  }

  return {
    fileInputRef,
    coverImage,
    rawImage,
    uploading,
    openPicker,
    onFileSelected,
    onCropConfirmed,
    onCropCancelled,
    clearCover,
  }
}
