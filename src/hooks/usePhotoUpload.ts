import { useRef, useState } from 'react'
import { addPhoto } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { MAX_UPLOAD_MB, uploadImage, resizeImageForUpload } from '../utils/cloudinary'

export const PHOTO_CAPTION_MAX = 120

// Subidas simultáneas máximas — bastante para que un lote de fotos se sienta
// rápido sin saturar el wifi del salón (donde decenas de invitados pueden
// estar subiendo fotos al mismo tiempo) ni abrir demasiadas conexiones a la
// vez desde un celular de gama baja.
const MAX_CONCURRENT_UPLOADS = 3

export interface QueuedUpload {
  id: string
  fileName: string
  previewUrl: string
  status: 'queued' | 'compressing' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

interface QueueItem extends QueuedUpload {
  file: File
  caption?: string
}

export function usePhotoUpload(
  eventId: string,
  authorName: string,
  authorToken: string,
  onUploaded?: () => void,
) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [uploadError, setUploadError] = useState('')
  const [caption, setCaption] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploading = queue.some((q) => q.status === 'queued' || q.status === 'compressing' || q.status === 'uploading')

  function openPicker() {
    fileRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    const validFiles: File[] = []
    let rejected = false
    for (const file of files) {
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        rejected = true
        continue
      }
      validFiles.push(file)
    }
    setUploadError(rejected ? `Algunas fotos superan los ${MAX_UPLOAD_MB} MB y no se subieron.` : '')
    if (validFiles.length === 0) return

    // Una sola foto: se mantiene el paso de "agregar descripción" antes de
    // subir. Varias a la vez: se suben directo en lote (como un picker de
    // galería normal) — pedir una descripción por cada una sería una fricción
    // enorme para lo que en la práctica es "subí todas estas fotos del evento".
    if (validFiles.length === 1) {
      setCaption('')
      setPendingFile(validFiles[0])
    } else {
      enqueue(validFiles)
    }
  }

  function cancelUpload() {
    setPendingFile(null)
  }

  function enqueue(files: File[], sharedCaption?: string) {
    const items: QueueItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      status: 'queued',
      progress: 0,
      caption: sharedCaption,
    }))
    setQueue((prev) => [...prev, ...items])
    runPool(items)
  }

  async function processItem(item: QueueItem) {
    setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'compressing', error: undefined } : q)))
    try {
      const { blob, width, height } = await resizeImageForUpload(item.file)
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 0 } : q)))
      const url = await uploadImage(blob, (pct) => {
        setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, progress: pct } : q)))
      })
      await addPhoto(eventId, {
        url,
        authorName,
        authorToken,
        caption: item.caption?.trim() || undefined,
        width,
        height,
      } as Omit<PhotoData, 'id' | 'createdAt' | 'pinned'>)
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'done', progress: 100 } : q)))
      onUploaded?.()
      // Auto-limpieza tras un momento: el usuario ya vio el check verde, no
      // hace falta que se quede ocupando la bandeja hasta que la cierre a mano.
      setTimeout(() => {
        setQueue((prev) => {
          const done = prev.find((q) => q.id === item.id)
          if (done) URL.revokeObjectURL(done.previewUrl)
          return prev.filter((q) => q.id !== item.id)
        })
      }, 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo subir la foto.'
      setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, status: 'error', error: message } : q)))
    }
  }

  async function runPool(items: QueueItem[]) {
    let cursor = 0
    async function worker() {
      while (cursor < items.length) {
        const item = items[cursor++]
        await processItem(item)
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, items.length) }, worker))
  }

  function retryItem(id: string) {
    const item = queue.find((q) => q.id === id)
    if (item) processItem(item)
  }

  function dismissItem(id: string) {
    setQueue((prev) => {
      const item = prev.find((q) => q.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((q) => q.id !== id)
    })
  }

  function confirmUpload() {
    if (!pendingFile) return
    const file = pendingFile
    const trimmedCaption = caption.trim() || undefined
    setPendingFile(null)
    setCaption('')
    enqueue([file], trimmedCaption)
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
    queue,
    retryItem,
    dismissItem,
  }
}
