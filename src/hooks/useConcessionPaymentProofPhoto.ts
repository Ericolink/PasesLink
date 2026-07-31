import { useEffect, useMemo, useState } from 'react'
import { MAX_UPLOAD_MB, resizeImageForUpload, uploadImage } from '../utils/cloudinary'

// Primera vez que este repo sube una FOTO de comprobante (el pago de entrada
// solo pide un texto de referencia, ver PaymentProofForm.tsx) — a propósito
// SIN recorte (usePickAndCropImage/ImageCropModal): un comprobante suele ser
// una captura de pantalla, forzarla a un aspect ratio fijo le recortaría
// datos reales (fecha, monto, folio). Mismo patrón de archivo/preview/resize
// que useWallComposer.ts, sin la parte de publicar al muro.
export function useConcessionPaymentProofPhoto() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    e.target.value = ''
    if (!selected) return
    if (!selected.type.startsWith('image/')) {
      setError('Elegí un archivo de imagen (JPG, PNG, captura de pantalla, etc.).')
      return
    }
    if (selected.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`La imagen no puede superar los ${MAX_UPLOAD_MB} MB.`)
      return
    }
    setError('')
    setFile(selected)
  }

  function clear() {
    setFile(null)
    setError('')
  }

  // Sube recién cuando el invitado confirma el envío (no apenas elige la
  // foto) — evita gastar la subida si después cambia el número de
  // referencia y decide cancelar. Devuelve la URL final para que el caller
  // se la pase a submitConcessionPaymentProof.
  async function upload(): Promise<string> {
    if (!file) throw new Error('Elegí una foto del comprobante antes de enviar.')
    setUploading(true)
    try {
      const { blob } = await resizeImageForUpload(file)
      return await uploadImage(blob)
    } catch {
      setError('No se pudo subir la imagen. Verifica tu conexión e intenta de nuevo.')
      throw new Error('concession-proof-upload-failed')
    } finally {
      setUploading(false)
    }
  }

  return { file, previewUrl, uploading, error, onFileSelected, clear, upload }
}
