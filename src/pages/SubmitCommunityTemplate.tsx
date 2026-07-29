import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AccessibleButton } from '../components/accessibility/AccessibleButton'
import { AccessibleField } from '../components/accessibility/AccessibleField'
import { CommunityTemplatePreviewCard } from '../components/CommunityTemplatePreviewCard'
import { CoverImagePicker } from '../components/CoverImagePicker'
import { ImageCropModal } from '../components/ImageCropModal'
import { LoadingInline } from '../components/LoadingInline'
import { ScreenHeader } from '../components/ScreenHeader'
import { useAuth } from '../hooks/useAuth'
import { useCoverPhoto } from '../hooks/useCoverPhoto'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useUserProfile } from '../hooks/useUserProfile'
import { getCommunityTemplate, submitCommunityTemplate, updateCommunityTemplate } from '../firebase/communityTemplates'
import {
  BUTTON_VARIANT_OPTIONS,
  COMMUNITY_FONT_OPTIONS,
  CONFETTI_SHAPE_OPTIONS,
  ENTER_ANIMATION_OPTIONS,
  SPACING_SCALE_OPTIONS,
} from '../templates/registry'
import type { CommunityTemplateVars } from '../types'

const inputClass =
  'w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary'
const colorInputClass = 'w-full h-10 rounded-md border border-gray-300 dark:border-gray-600 cursor-pointer'

const BORDER_RADIUS_OPTIONS = [
  { value: '0rem', label: 'Cuadrado' },
  { value: '0.25rem', label: 'Sutil' },
  { value: '0.5rem', label: 'Redondeado' },
  { value: '0.75rem', label: 'Muy redondeado' },
  { value: '1.25rem', label: 'Máximo' },
]

const SHADOW_OPTIONS = [
  { value: 'none', label: 'Ninguna' },
  { value: '0 4px 12px rgba(0,0,0,.15)', label: 'Suave' },
  { value: '0 10px 25px rgba(0,0,0,.25)', label: 'Media' },
  { value: '0 20px 45px rgba(0,0,0,.35)', label: 'Fuerte' },
]

const COMPATIBILITY_OPTIONS = [
  { value: 'confetti', label: 'Confeti de check-in' },
  { value: 'wall', label: 'Muro del evento' },
  { value: 'shareCard', label: 'Tarjeta para compartir' },
  { value: 'ticketTheme', label: 'Boleto/pase' },
]

const DEFAULT_VARS: CommunityTemplateVars = {
  accent: '#2563eb',
  accentDark: '#1d4ed8',
  accentSoft: '#dbeafe',
  pageBg: '#eef1f5',
  surface: '#ffffff',
  text: '#111827',
  textMuted: '#6b7280',
  border: '#e5e7eb',
  fontFamily: 'inherit',
  borderRadius: '0.5rem',
  shadow: '0 4px 12px rgba(0,0,0,.15)',
  enterAnimation: 'animate-fade-in-up',
  buttonVariant: 'solid',
  spacingScale: 'cozy',
}

const COLOR_FIELDS: { key: keyof CommunityTemplateVars; label: string }[] = [
  { key: 'accent', label: 'Acento' },
  { key: 'accentDark', label: 'Acento oscuro' },
  { key: 'accentSoft', label: 'Acento suave' },
  { key: 'pageBg', label: 'Fondo de página' },
  { key: 'surface', label: 'Superficie (tarjeta)' },
  { key: 'text', label: 'Texto' },
  { key: 'textMuted', label: 'Texto secundario' },
  { key: 'border', label: 'Borde' },
]

// Formulario de envío para el flujo de plantillas comunitarias (feature de
// innovación) — un diseñador externo propone un set de tokens visuales
// (MISMA forma que InvitationTemplate['vars'] en registry.ts), no código.
// Todos los campos de estilo son selects/color pickers curados (nunca texto
// libre) para que un envío nunca pueda romper el render del resto de la app —
// mismo criterio ya aplicado a EventData.themeOverrides.secondaryFontFamily.
export function SubmitCommunityTemplate() {
  useDocumentTitle('Proponer una plantilla')
  const navigate = useNavigate()
  const { id: editId } = useParams<{ id?: string }>()
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const [loadingExisting, setLoadingExisting] = useState(!!editId)
  const [previousVersion, setPreviousVersion] = useState(1)

  const {
    fileInputRef: coverFileInputRef,
    coverImage: previewImageUrl,
    rawImage: coverRawImage,
    uploading: coverUploading,
    error: coverError,
    openPicker: openCoverPicker,
    onFileSelected: onCoverFileSelected,
    onCropConfirmed: onCoverCropConfirmed,
    onCropCancelled: onCoverCropCancelled,
    clearCover,
    setCoverImage,
  } = useCoverPhoto('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [license, setLicense] = useState('')
  const [compatibility, setCompatibility] = useState<string[]>([])
  const [vars, setVars] = useState<CommunityTemplateVars>(DEFAULT_VARS)
  const [submitting, setSubmitting] = useState<'draft' | 'review' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editId) return
    let cancelled = false
    getCommunityTemplate(editId).then((existing) => {
      if (cancelled || !existing) return
      setName(existing.name)
      setDescription(existing.description)
      setCategory(existing.category)
      setLicense(existing.license)
      setCompatibility(existing.compatibility)
      setVars(existing.vars)
      setPreviousVersion(existing.version)
      if (existing.previewImageUrl) setCoverImage(existing.previewImageUrl)
    }).finally(() => { if (!cancelled) setLoadingExisting(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  function updateVar<K extends keyof CommunityTemplateVars>(key: K, value: CommunityTemplateVars[K]) {
    setVars((prev) => ({ ...prev, [key]: value }))
  }

  function toggleCompatibility(value: string) {
    setCompatibility((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]))
  }

  async function handleSubmit(submit: boolean) {
    if (!user) return
    setError('')
    setSubmitting(submit ? 'review' : 'draft')
    try {
      const id = editId
        ? await updateCommunityTemplate(editId, {
          name, description, category, previewImageUrl, vars, license, compatibility, submit, previousVersion,
        }).then(() => editId)
        : await submitCommunityTemplate({
          authorUid: user.uid,
          authorDisplayName: profile?.displayName || user.displayName || 'Diseñador/a de PaseLink',
          name,
          description,
          category,
          previewImageUrl,
          vars,
          license,
          compatibility,
          submit,
        })
      navigate(`/my-templates?highlight=${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la plantilla. Intenta de nuevo.')
    } finally {
      setSubmitting(null)
    }
  }

  if (loadingExisting) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-10">
        <ScreenHeader title="Proponer una plantilla" backTo="/my-templates" />
        <LoadingInline label="Cargando plantilla…" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] animate-fade-in">
      <ScreenHeader title={editId ? 'Editar plantilla' : 'Proponer una plantilla'} backTo="/my-templates" />
      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2 mb-6">
        Diseña un set de colores y tipografía para PaseLink. El equipo revisa cada envío antes de publicarlo en el
        catálogo — podés guardar un borrador y volver más tarde, o mandarlo directo a revisión.
      </p>

      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-5">
          <AccessibleField label="Nombre de la plantilla" id="ct-name" required>
            {(fieldProps) => (
              <input {...fieldProps} type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ej: Atardecer tropical" />
            )}
          </AccessibleField>

          <AccessibleField label="Descripción" id="ct-description">
            {(fieldProps) => (
              <textarea {...fieldProps} value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} className={inputClass} placeholder="Una oración corta que ayude a elegirla" />
            )}
          </AccessibleField>

          <div className="grid grid-cols-2 gap-3">
            <AccessibleField label="Categoría" id="ct-category" required>
              {(fieldProps) => (
                <input {...fieldProps} type="text" value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} className={inputClass} placeholder="Ej: Fiesta infantil" />
              )}
            </AccessibleField>
            <AccessibleField label="Licencia" id="ct-license">
              {(fieldProps) => (
                <input {...fieldProps} type="text" value={license} maxLength={60} onChange={(e) => setLicense(e.target.value)} className={inputClass} placeholder="Ej: PaseLink, CC-BY" />
              )}
            </AccessibleField>
          </div>

          <CoverImagePicker
            id="ct-preview-image"
            fileInputRef={coverFileInputRef}
            coverImage={previewImageUrl}
            coverUploading={coverUploading}
            coverError={coverError}
            openCoverPicker={openCoverPicker}
            onCoverFileSelected={onCoverFileSelected}
            clearCover={clearCover}
          />

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Colores</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {COLOR_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label htmlFor={`ct-color-${key}`} className="block text-xs text-gray-600 dark:text-gray-300 mb-1">{label}</label>
                  <input
                    id={`ct-color-${key}`}
                    type="color"
                    value={vars[key] as string}
                    onChange={(e) => updateVar(key, e.target.value as CommunityTemplateVars[typeof key])}
                    className={colorInputClass}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AccessibleField label="Tipografía principal" id="ct-font">
              {(fieldProps) => (
                <select {...fieldProps} value={vars.fontFamily} onChange={(e) => updateVar('fontFamily', e.target.value)} className={inputClass}>
                  {COMMUNITY_FONT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </AccessibleField>
            <AccessibleField label="Tipografía secundaria" id="ct-secondary-font">
              {(fieldProps) => (
                <select {...fieldProps} value={vars.secondaryFontFamily || ''} onChange={(e) => updateVar('secondaryFontFamily', e.target.value || undefined)} className={inputClass}>
                  <option value="">Igual a la principal</option>
                  {COMMUNITY_FONT_OPTIONS.filter((o) => o.value !== 'inherit').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </AccessibleField>
            <AccessibleField label="Bordes" id="ct-radius">
              {(fieldProps) => (
                <select {...fieldProps} value={vars.borderRadius} onChange={(e) => updateVar('borderRadius', e.target.value)} className={inputClass}>
                  {BORDER_RADIUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </AccessibleField>
            <AccessibleField label="Sombra" id="ct-shadow">
              {(fieldProps) => (
                <select {...fieldProps} value={vars.shadow} onChange={(e) => updateVar('shadow', e.target.value)} className={inputClass}>
                  {SHADOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </AccessibleField>
            <AccessibleField label="Animación de entrada" id="ct-animation">
              {(fieldProps) => (
                <select {...fieldProps} value={vars.enterAnimation} onChange={(e) => updateVar('enterAnimation', e.target.value as CommunityTemplateVars['enterAnimation'])} className={inputClass}>
                  {ENTER_ANIMATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </AccessibleField>
            <AccessibleField label="Botón" id="ct-button-variant">
              {(fieldProps) => (
                <select {...fieldProps} value={vars.buttonVariant || 'solid'} onChange={(e) => updateVar('buttonVariant', e.target.value as CommunityTemplateVars['buttonVariant'])} className={inputClass}>
                  {BUTTON_VARIANT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </AccessibleField>
            <AccessibleField label="Densidad" id="ct-spacing">
              {(fieldProps) => (
                <select {...fieldProps} value={vars.spacingScale || 'cozy'} onChange={(e) => updateVar('spacingScale', e.target.value as CommunityTemplateVars['spacingScale'])} className={inputClass}>
                  {SPACING_SCALE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </AccessibleField>
            <AccessibleField label="Forma del confeti" id="ct-confetti">
              {(fieldProps) => (
                <select {...fieldProps} value={vars.confettiShape || ''} onChange={(e) => updateVar('confettiShape', (e.target.value || undefined) as CommunityTemplateVars['confettiShape'])} className={inputClass}>
                  <option value="">Mezcla por defecto</option>
                  {CONFETTI_SHAPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
            </AccessibleField>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Compatibilidad verificada <span className="font-normal normal-case text-gray-400">(informativo, opcional)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {COMPATIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleCompatibility(opt.value)}
                  aria-pressed={compatibility.includes(opt.value)}
                  className={`text-xs font-medium rounded-full border px-3 py-1.5 transition-colors ${
                    compatibility.includes(opt.value)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <AccessibleButton variant="secondary" onClick={() => handleSubmit(false)} disabled={!name.trim() || !!submitting} className="flex-1">
              {submitting === 'draft' ? 'Guardando…' : 'Guardar borrador'}
            </AccessibleButton>
            <AccessibleButton onClick={() => handleSubmit(true)} disabled={!name.trim() || !category.trim() || !!submitting} className="flex-1">
              {submitting === 'review' ? 'Enviando…' : 'Enviar a revisión'}
            </AccessibleButton>
          </div>
        </div>

        <div className="sm:sticky sm:top-20">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vista previa</p>
          <CommunityTemplatePreviewCard vars={vars} className={`w-56 ${vars.enterAnimation}`} />
        </div>
      </div>

      {coverRawImage && (
        <ImageCropModal imageSrc={coverRawImage} aspect={16 / 9} onCrop={onCoverCropConfirmed} onCancel={onCoverCropCancelled} />
      )}
    </div>
  )
}
