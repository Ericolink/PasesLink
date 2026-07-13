import type { RefObject } from 'react'
import { getTemplate } from '../../../templates/registry'
import type { TemplateId } from '../../../types'
import { CoverImagePicker } from '../../CoverImagePicker'

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
        <CoverImagePicker
          id="event-cover-image"
          fileInputRef={coverFileInputRef}
          coverImage={coverImage}
          coverUploading={coverUploading}
          coverError={coverError}
          openCoverPicker={openCoverPicker}
          onCoverFileSelected={onCoverFileSelected}
          clearCover={clearCover}
        />

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
