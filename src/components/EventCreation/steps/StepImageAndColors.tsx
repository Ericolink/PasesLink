import type { RefObject } from 'react'
import { getTemplate, SECONDARY_FONT_OPTIONS } from '../../../templates/registry'
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
  secondaryFontFamily: string
  onSecondaryFontFamilyChange: (value: string) => void
  buttonVariant: 'solid' | 'outline'
  onButtonVariantChange: (value: 'solid' | 'outline') => void
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
  secondaryFontFamily,
  onSecondaryFontFamilyChange,
  buttonVariant,
  onButtonVariantChange,
}: StepImageAndColorsProps) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Es opcional, pero es lo primero que ven tus invitados. Puedes cambiarlo en cualquier momento.
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
            Se usa en botones, íconos y detalles de la invitación. Si no eliges uno, se usa el color de la plantilla.
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

        {/* Tipografía secundaria y variante de botón — Feature 2:
            personalización de plantillas. Opciones curadas (no un font
            picker libre) para no volverse una configuración difícil de
            mantener; spacingScale queda fijo por plantilla, no se expone acá. */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
          <div>
            <label htmlFor="event-secondary-font" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tipografía secundaria
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Se usa en el texto de lectura de la invitación (FAQ, transporte, secciones nuevas).
            </p>
            <select
              id="event-secondary-font"
              value={secondaryFontFamily}
              onChange={(e) => onSecondaryFontFamilyChange(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900"
            >
              {SECONDARY_FONT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estilo del botón principal
            </span>
            <div className="flex gap-2">
              {(['solid', 'outline'] as const).map((variant) => (
                <button
                  key={variant}
                  type="button"
                  onClick={() => onButtonVariantChange(variant)}
                  aria-pressed={buttonVariant === variant}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    buttonVariant === variant
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {variant === 'solid' ? 'Relleno' : 'Contorno'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
