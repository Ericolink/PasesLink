import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { saveUserProfile } from '../firebase/userProfile'
import { useAuth } from '../hooks/useAuth'
import { uploadImage } from '../utils/cloudinary'
import { usePickAndCropImage } from '../hooks/usePickAndCropImage'
import { ImageCropModal } from '../components/ImageCropModal'
import { AuthErrorMessage } from '../components/AuthErrorMessage'
import { getAuthErrorInfo, type AuthErrorInfo } from '../utils/firebaseErrorMessages'

export function CompleteProfile() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Pre-parse Google displayName
  const parts    = (user?.displayName || '').split(' ')
  const [firstName, setFirstName] = useState(parts[0] || '')
  const [lastName, setLastName]   = useState(parts.slice(1).join(' ') || '')
  const [birthDate, setBirthDate] = useState('')
  const [photoFile, setPhotoFile] = useState<Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photoURL || null)
  const [loading, setLoading] = useState(false)
  const [errorInfo, setErrorInfo] = useState<AuthErrorInfo | null>(null)

  const { fileInputRef: fileRef, rawImage, error: pickError, openPicker, onFileSelected, onCropConfirmed, onCropCancelled } =
    usePickAndCropImage((blob) => {
      setPhotoFile(blob)
      setPhotoPreview(URL.createObjectURL(blob))
    })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setLoading(true)
    setErrorInfo(null)
    try {
      let photoURL = user.photoURL || undefined
      if (photoFile) photoURL = await uploadImage(photoFile)
      const displayName = `${firstName} ${lastName}`.trim()
      await updateProfile(user, { displayName, photoURL: photoURL || user.photoURL || '' })
      await saveUserProfile(user.uid, {
        email: user.email || '',
        firstName,
        lastName,
        displayName,
        birthDate,
        photoURL,
      })
      navigate('/dashboard')
    } catch (err) {
      setErrorInfo(getAuthErrorInfo(err, 'No pudimos guardar tu perfil. Intenta de nuevo.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
          Completa tu perfil
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          Solo un momento más antes de entrar
        </p>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-5">
          <button type="button" onClick={openPicker} aria-label="Elegir foto de perfil"
            className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-dashed border-gray-300 hover:border-primary transition-colors bg-gray-100 dark:bg-gray-800">
            {photoPreview
              ? <img src={photoPreview} alt="" className="w-full h-full object-cover" />
              : <span className="text-xs text-gray-500 text-center px-1">Foto<br/>(opcional)</span>
            }
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
          {pickError && <p className="text-xs text-red-500 mt-1.5">{pickError}</p>}
        </div>

        {rawImage && (
          <ImageCropModal
            imageSrc={rawImage}
            aspect={1}
            cropShape="round"
            maxOutputDimension={800}
            onCrop={onCropConfirmed}
            onCancel={onCropCancelled}
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-3 bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="complete-profile-first-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
              <input id="complete-profile-first-name" type="text" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="complete-profile-last-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Apellido *</label>
              <input id="complete-profile-last-name" type="text" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label htmlFor="complete-profile-birth-date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha de nacimiento *</label>
            <input id="complete-profile-birth-date" type="date" required autoComplete="bday" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-300 rounded-md px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          {errorInfo && <AuthErrorMessage info={errorInfo} />}
          <button type="submit" disabled={loading}
            className="w-full bg-primary text-white rounded-md py-3 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
            {loading ? 'Guardando…' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
