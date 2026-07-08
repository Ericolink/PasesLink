import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { useModalA11y } from '../hooks/useModalA11y'
import { useScrollLock } from '../hooks/useScrollLock'
import { cropImageToBlob } from '../utils/imageCrop'

interface Props {
  imageSrc: string
  aspect: number
  cropShape?: 'rect' | 'round'
  maxOutputDimension?: number
  onCrop: (blob: Blob) => void
  onCancel: () => void
}

const INITIAL_CROP = { x: 0, y: 0 }
const INITIAL_ZOOM = 1

export function ImageCropModal({ imageSrc, aspect, cropShape = 'rect', maxOutputDimension = 1600, onCrop, onCancel }: Props) {
  const [crop, setCrop] = useState(INITIAL_CROP)
  const [zoom, setZoom] = useState(INITIAL_ZOOM)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  // El padre monta/desmonta este componente en vez de pasar un flag `open`
  // interno — el montaje ya equivale a "abierto", por eso `true` fijo.
  const dialogRef = useModalA11y<HTMLDivElement>(true, onCancel)
  useScrollLock(true)

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels)
  }, [])

  function handleReset() {
    setCrop(INITIAL_CROP)
    setZoom(INITIAL_ZOOM)
  }

  async function handleConfirm() {
    if (!croppedArea) return
    setProcessing(true)
    try {
      const blob = await cropImageToBlob(imageSrc, croppedArea, { maxDimension: maxOutputDimension })
      onCrop(blob)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Recortar imagen"
      className="fixed inset-0 z-50 grid grid-rows-[auto_1fr_auto] h-dvh bg-black animate-scale-in"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Fila 1 (auto): siempre a su altura natural, nunca puede ser empujada
          fuera de la pantalla por el contenido del medio. */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-black/90 border-b border-white/10">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors"
        >
          Cancelar
        </button>
        <span className="text-sm font-medium text-white">Recortar imagen</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={processing || !croppedArea}
          className="px-5 py-2 rounded-full text-sm font-semibold bg-primary text-white hover:bg-primary-dark disabled:opacity-50 transition-colors"
        >
          {processing ? 'Procesando…' : 'Usar imagen'}
        </button>
      </div>

      {/* Fila 2 (1fr): absorbe todo el espacio y el overflow del cropper —
          la grid, a diferencia de flex-1, garantiza que esta fila nunca
          exceda su porción del layout aunque su contenido mida distinto. */}
      <div className="relative min-h-0 overflow-hidden">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          cropShape={cropShape}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      {/* Fila 3 (auto): igual de protegida que el header. */}
      <div className="px-5 py-3.5 bg-black/90 border-t border-white/10 space-y-2.5">
        <p className="text-xs text-gray-400 text-center">Pellizca o desliza para ajustar</p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="flex-1 accent-primary"
          />
          <button
            type="button"
            onClick={handleReset}
            className="text-xs font-medium text-gray-300 hover:text-white px-2 py-1 transition-colors shrink-0"
          >
            Restablecer
          </button>
        </div>
      </div>
    </div>
  )
}
