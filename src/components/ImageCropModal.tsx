import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'

interface Props {
  imageSrc: string
  onCrop: (blob: Blob) => void
  onCancel: () => void
}

export function ImageCropModal({ imageSrc, onCrop, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels)
  }, [])

  async function handleConfirm() {
    if (!croppedArea) return
    setProcessing(true)
    try {
      const blob = await cropImageToBlob(imageSrc, croppedArea)
      onCrop(blob)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <button onClick={onCancel} className="text-sm text-gray-300 hover:text-white">
          Cancelar
        </button>
        <span className="text-sm font-medium text-white">Recortar imagen</span>
        <button
          onClick={handleConfirm}
          disabled={processing}
          className="text-sm font-semibold text-primary hover:text-primary-dark disabled:opacity-50"
        >
          {processing ? 'Procesando…' : 'Usar imagen'}
        </button>
      </div>

      <div className="relative flex-1">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={16 / 9}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="px-6 py-4 bg-black/80">
        <p className="text-xs text-gray-400 text-center mb-2">Pellizca o desliza para ajustar</p>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>
    </div>
  )
}

async function cropImageToBlob(imageSrc: string, area: Area): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageSrc
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = area.width
      canvas.height = area.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo procesar la imagen'))
      }, 'image/jpeg', 0.9)
    }
    img.onerror = reject
  })
}
