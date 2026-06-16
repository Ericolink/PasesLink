import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { changePassword, updateDisplayName, uploadProfilePhoto } from '../firebase/auth'
import { IconCheckCircle, IconUsers } from '../components/Icons'

export function Profile() {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')

  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')

  if (!user) return null

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault()
    setProfileError('')
    setProfileMessage('')
    setProfileSaving(true)
    try {
      await updateDisplayName(displayName)
      setProfileMessage('Tus datos se actualizaron correctamente.')
    } catch {
      setProfileError('No pudimos actualizar tus datos. Intenta de nuevo.')
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError('')
    setPhotoUploading(true)
    try {
      const url = await uploadProfilePhoto(file)
      setPhotoURL(url)
    } catch {
      setPhotoError('No pudimos subir la imagen. Verifica que sea una imagen de menos de 5MB.')
    } finally {
      setPhotoUploading(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordMessage('')
    if (newPassword.length < 6) {
      setPasswordError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.')
      return
    }
    setPasswordSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordMessage('Tu contraseña fue actualizada correctamente.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setPasswordError('No pudimos cambiar tu contraseña. Verifica que tu contraseña actual sea correcta.')
    } finally {
      setPasswordSaving(false)
    }
  }

  const isGoogleUser = user.providerData.some((p) => p.providerId === 'google.com')

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">Mi perfil</h1>

      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Datos personales</h2>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center shrink-0">
            {photoURL ? (
              <img src={photoURL} alt="Foto de perfil" className="w-full h-full object-cover" />
            ) : (
              <IconUsers className="w-8 h-8 text-gray-400" />
            )}
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoUploading}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {photoUploading ? 'Subiendo...' : 'Cambiar foto'}
            </button>
            {photoError && <p className="text-sm text-red-600 mt-2">{photoError}</p>}
          </div>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={user.email || ''}
              disabled
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-gray-50 dark:bg-gray-900 text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {profileError && <p className="text-sm text-red-600">{profileError}</p>}
          {profileMessage && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <IconCheckCircle className="w-4 h-4" /> {profileMessage}
            </p>
          )}
          <button
            type="submit"
            disabled={profileSaving}
            className="bg-primary text-white rounded-md px-4 py-2 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {profileSaving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      </section>

      {!isGoogleUser && (
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Cambiar contraseña</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Contraseña actual
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nueva contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirmar nueva contraseña
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            {passwordMessage && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <IconCheckCircle className="w-4 h-4" /> {passwordMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={passwordSaving}
              className="bg-primary text-white rounded-md px-4 py-2 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {passwordSaving ? 'Guardando...' : 'Cambiar contraseña'}
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
