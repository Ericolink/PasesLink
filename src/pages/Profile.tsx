import { useRef, useState, useEffect } from 'react'
import { updateProfile } from 'firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { changePassword, uploadProfilePhoto } from '../firebase/auth'
import { IconCheckCircle, IconUsers } from '../components/Icons'

export function Profile() {
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [photoURL, setPhotoURL] = useState('')

  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError]         = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving]   = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError]     = useState('')

  useEffect(() => {
    setPhotoURL(profile?.photoURL || user?.photoURL || '')
  }, [profile, user])

  if (!user) return null

  const birthDate = profile?.birthDate || ''
  const birthDisplay = birthDate
    ? new Date(birthDate + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  const isGoogleUser = user.providerData.some((p) => p.providerId === 'google.com')

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoError('')
    setPhotoUploading(true)
    try {
      const url = await uploadProfilePhoto(file)
      await updateProfile(user!, { photoURL: url })
      setPhotoURL(url)
    } catch {
      setPhotoError('No pudimos subir la imagen. Verifica que sea menor de 5 MB.')
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Mi perfil</h1>

      {/* ── Datos personales ── */}
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-5">Datos personales</h2>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center shrink-0 ring-2 ring-primary/40">
            {photoURL
              ? <img src={photoURL} alt="Foto de perfil" className="w-full h-full object-cover" />
              : <IconUsers className="w-10 h-10 text-gray-400" />
            }
          </div>
          <div className="space-y-1">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoUploading}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {photoUploading ? 'Subiendo…' : 'Cambiar foto'}
            </button>
            {photoError && <p className="text-xs text-red-500">{photoError}</p>}
          </div>
        </div>

        {/* Read-only fields */}
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Email</p>
            <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
              {user.email}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nombre</p>
              <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
                {profile?.firstName || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Apellido</p>
              <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
                {profile?.lastName || '—'}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Fecha de nacimiento</p>
            <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
              {birthDisplay}
            </p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Para modificar tu nombre o fecha de nacimiento, contacta con soporte.
          </p>
        </div>
      </section>

      {/* ── Cambiar contraseña ── */}
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Cambiar contraseña</h2>

        {isGoogleUser ? (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
            Tu cuenta está vinculada con Google. Gestiona tu contraseña directamente desde{' '}
            <a
              href="https://myaccount.google.com/security"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              Google Account
            </a>
            .
          </div>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña actual</label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nueva contraseña</label>
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar nueva contraseña</label>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {passwordError   && <p className="text-sm text-red-500">{passwordError}</p>}
            {passwordMessage && (
              <p className="text-sm text-green-500 flex items-center gap-1">
                <IconCheckCircle className="w-4 h-4" /> {passwordMessage}
              </p>
            )}
            <button
              type="submit"
              disabled={passwordSaving}
              className="bg-primary text-white rounded-md px-4 py-2 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {passwordSaving ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </form>
        )}
      </section>

    </div>
  )
}
