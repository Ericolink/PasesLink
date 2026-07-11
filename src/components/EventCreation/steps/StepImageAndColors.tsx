import type { RefObject } from 'react'
import { optimizedImageUrl } from '../../../utils/cloudinary'
import { getTemplate } from '../../../templates/registry'
import type { TemplateId } from '../../../types'

interface StepImageAndColorsProps {
  coverFileInputRef: RefObject<HTMLInputElement | null>
  coverImage: string
  coverUploading: boolean
  coverError: string
  openCoverPicker: () => void
  onCoverFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void
  clearCover: () => void
  accentColor: string
  onAccentColorChange: (value: string) => void
  templateId: TemplateId
}

export function StepImageAndColors({
  coverFileInputRef,
  coverImage,
  coverUploading,
  coverError,
  openCoverPicker,
  onCoverFileSelected,
  clearCover,
  accentColor,
  onAccentColorChange,
  templateId,
}: StepImageAndColorsProps) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Es opcional, pero es lo primero que ven tus invitados. Podés cambiarlo en cualquier momento.
      </p>

      <div className="space-y-5">
        {/* Portada */}
        <div>
          <label htmlFor="event-cover-image" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Imagen de portada
          </label>
          <input
            id="event-cover-image"
            ref={coverFileInputRef}
            type="file"
            accept="image/*"
            onChange={onCoverFileSelected}
            className="hidden"
          />
          {coverImage ? (
            <div className="relative rounded-lg overflow-hidden h-40 bg-gray-100">
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
                className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-md px-2 py-1"
              >
                Quitar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openCoverPicker}
              disabled={coverUploading}
              className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg py-8 text-sm text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {coverUploading ? 'Subiendo…' : '+ Subir imagen de portada'}
            </button>
          )}
          {coverError && <p className="text-xs text-red-500 mt-1.5">{coverError}</p>}
        </div>

        {/* Color de acento */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <label htmlFor="event-accent-color" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Color de acento
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Se usa en botones, íconos y detalles de la invitación. Si no elegís uno, se usa el color de la plantilla.
          </p>
          <div className="flex items-center gap-2">
            <input
              id="event-accent-color"
              type="color"
              value={accentColor || getTemplate(templateId).vars.accent}
              onChange={(e) => onAccentColorChange(e.target.value)}
              className="h-10 w-14 border border-gray-300 rounded-md cursor-pointer"
            />
            <span className="text-xs text-gray-500">
              {accentColor || `De la plantilla`}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}
