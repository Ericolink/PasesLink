import type { RefObject } from 'react'
import { optimizedImageUrl } from '../utils/cloudinary'
import { FieldError } from './FieldError'

interface Props {
  id: string
  fileInputRef: RefObject<HTMLInputElement | null>
  coverImage: string
  coverUploading: boolean
  coverError: string
  openCoverPicker: () => void
  onCoverFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void
  clearCover: () => void
  /** true en EditEventForm (formulario más denso, preview más chico). */
  compact?: boolean
}

// Selector de portada compartido por el wizard de creación
// (StepImageAndColors.tsx) y la edición de evento (EditEventForm.tsx) — antes
// duplicado literal en ambos, incluido el botón "Quitar" con área táctil de
// ~24px (px-2 py-1) que el mismo bug arrastraba a los dos lugares por igual.
export function CoverImagePicker({
  id,
  fileInputRef,
  coverImage,
  coverUploading,
  coverError,
  openCoverPicker,
  onCoverFileSelected,
  clearCover,
  compact = false,
}: Props) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Imagen de portada
      </label>
      <input id={id} ref={fileInputRef} type="file" accept="image/*" onChange={onCoverFileSelected} className="hidden" />
      {coverImage ? (
        <div className={`relative rounded-lg overflow-hidden bg-gray-100 ${compact ? 'h-28' : 'h-40'}`}>
          <img
            src={optimizedImageUrl(coverImage, 800)}
            alt="Portada"
            loading="lazy"
            crossOrigin="anonymous"
            className="w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={clearCover}
            className="absolute top-2 right-2 min-h-11 inline-flex items-center px-3 bg-black/50 hover:bg-black/70 text-white text-xs font-medium rounded-md transition-colors"
          >
            Quitar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCoverPicker}
          disabled={coverUploading}
          className={`w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 ${compact ? 'py-4' : 'py-8'}`}
        >
          {coverUploading ? 'Subiendo…' : '+ Subir imagen de portada'}
        </button>
      )}
      <FieldError message={coverError} />
    </div>
  )
}
