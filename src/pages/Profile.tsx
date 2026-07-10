import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { updateProfile } from 'firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useUnreadFeedbackCount } from '../hooks/useUnreadFeedbackCount'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import {
  changePassword,
  linkEmailPassword,
  linkGoogleAccount,
  logout,
  unlinkProvider,
  uploadProfilePhoto,
} from '../firebase/auth'
import { saveUserProfile } from '../firebase/userProfile'
import { optimizedImageUrl } from '../utils/cloudinary'
import { getPasswordError, PASSWORD_HINT, PASSWORD_MIN_LENGTH } from '../utils/validationRules'
import { useModalA11y } from '../hooks/useModalA11y'
import { usePickAndCropImage } from '../hooks/usePickAndCropImage'
import { ImageCropModal } from '../components/ImageCropModal'
import {
  IconCheckCircle,
  IconEdit,
  IconLink,
  IconLogOut,
  IconMessageSquare,
  IconShield,
  IconUsers,
  IconX,
} from '../components/Icons'

/* ── Edit Name Modal ── */
function EditNameModal({
  initial,
  onSave,
  onClose,
}: {
  initial: { firstName: string; lastName: string }
  onSave: (first: string, last: string) => Promise<void>
  onClose: () => void
}) {
  const [first, setFirst] = useState(initial.firstName)
  const [last, setLast]   = useState(initial.lastName)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  // El padre monta/desmonta este componente en vez de un flag `open`
  // interno — el montaje ya equivale a "abierto".
  const dialogRef = useModalA11y<HTMLDivElement>(true, onClose)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!first.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true)
    setError('')
    try {
      await onSave(first.trim(), last.trim())
      onClose()
    } catch {
      setError('No pudimos guardar los cambios. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Editar nombre"
        className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 animate-fade-in"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">Editar nombre</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-white transition-colors">
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="edit-name-first" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre *</label>
            <input
              id="edit-name-first"
              type="text"
              required
              autoFocus
              autoComplete="given-name"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="edit-name-last" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Apellido</label>
            <input
              id="edit-name-last"
              type="text"
              autoComplete="family-name"
              value={last}
              onChange={(e) => setLast(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md py-2 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 bg-primary text-white rounded-md py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ── Main Page ── */
export function Profile() {
  useDocumentTitle('Perfil')
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const { isAdmin } = useIsAdmin()
  const unreadFeedback = useUnreadFeedbackCount()
  const navigate = useNavigate()

  /* Photo */
  const [photoURL, setPhotoURL]         = useState('')
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError]         = useState('')

  /* Edit name modal */
  const [showEditName, setShowEditName] = useState(false)
  const [nameMessage, setNameMessage]   = useState('')

  /* Linked accounts */
  const [showAddPassword, setShowAddPassword]     = useState(false)
  const [newLinkPassword, setNewLinkPassword]     = useState('')
  const [confirmLinkPassword, setConfirmLinkPassword] = useState('')
  const [linkPasswordSaving, setLinkPasswordSaving]   = useState(false)
  const [linkPasswordError, setLinkPasswordError]     = useState('')
  const [linkPasswordMsg, setLinkPasswordMsg]         = useState('')
  const [googleLinking, setGoogleLinking]     = useState(false)
  const [googleLinkError, setGoogleLinkError] = useState('')
  const [unlinkLoading, setUnlinkLoading]     = useState(false)
  const [unlinkError, setUnlinkError]         = useState('')

  /* Password change */
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving]   = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError]     = useState('')

  // Mantiene photoURL sincronizado con la fuente de verdad (Firestore vía
  // useUserProfile). Re-correr en cada snapshot es intencional e idempotente:
  // la foto ya se guarda optimistamente en su propio handler, esto solo
  // confirma el valor del servidor.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setPhotoURL(profile?.photoURL || user?.photoURL || '')
  }, [profile, user])
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ── Handlers ── */
  const { fileInputRef, rawImage, error: pickError, openPicker, onFileSelected, onCropConfirmed, onCropCancelled } =
    usePickAndCropImage(async (blob) => {
      setPhotoError('')
      setPhotoUploading(true)
      try {
        const url = await uploadProfilePhoto(blob)
        await updateProfile(user!, { photoURL: url })
        setPhotoURL(url)
      } catch {
        setPhotoError('No pudimos subir la imagen. Verifica que sea menor de 8 MB.')
      } finally {
        setPhotoUploading(false)
      }
    })

  if (!user) return null

  const hasGoogle = user.providerData.some((p) => p.providerId === 'google.com')
  const hasEmail  = user.providerData.some((p) => p.providerId === 'password')

  const birthDate    = profile?.birthDate || ''
  const birthDisplay = birthDate
    ? new Date(birthDate + 'T12:00:00').toLocaleDateString('es', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  async function handleSaveName(first: string, last: string) {
    const displayName = `${first} ${last}`.trim()
    await updateProfile(user!, { displayName })
    await saveUserProfile(user!.uid, { firstName: first, lastName: last, displayName })
    setNameMessage('Nombre actualizado.')
    setTimeout(() => setNameMessage(''), 3000)
  }

  async function handleLinkGoogle() {
    setGoogleLinkError('')
    setGoogleLinking(true)
    try {
      await linkGoogleAccount()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setGoogleLinkError(msg.includes('already-in-use')
        ? 'Esa cuenta de Google ya está asociada a otro usuario.'
        : 'No pudimos vincular Google. Intenta de nuevo.')
    } finally {
      setGoogleLinking(false)
    }
  }

  async function handleUnlink(providerId: string) {
    setUnlinkError('')
    setUnlinkLoading(true)
    try {
      await unlinkProvider(providerId)
    } catch {
      setUnlinkError('No pudimos desvincular el proveedor. Intenta de nuevo.')
    } finally {
      setUnlinkLoading(false)
    }
  }

  async function handleAddPassword(e: React.FormEvent) {
    e.preventDefault()
    setLinkPasswordError('')
    const passwordError = getPasswordError(newLinkPassword)
    if (passwordError) { setLinkPasswordError(passwordError); return }
    if (newLinkPassword !== confirmLinkPassword) { setLinkPasswordError('Las contraseñas no coinciden.'); return }
    setLinkPasswordSaving(true)
    try {
      await linkEmailPassword(newLinkPassword)
      setLinkPasswordMsg('Contraseña agregada correctamente.')
      setShowAddPassword(false)
      setNewLinkPassword('')
      setConfirmLinkPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setLinkPasswordError(msg.includes('already-in-use')
        ? 'Este email ya tiene contraseña asociada.'
        : 'No pudimos agregar la contraseña.')
    } finally {
      setLinkPasswordSaving(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordMessage('')
    const passwordError = getPasswordError(newPassword)
    if (passwordError) { setPasswordError(passwordError); return }
    if (newPassword !== confirmPassword) { setPasswordError('Las contraseñas no coinciden.'); return }
    setPasswordSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordMessage('Contraseña actualizada correctamente.')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch {
      setPasswordError('No pudimos cambiar la contraseña. Verifica que la contraseña actual sea correcta.')
    } finally {
      setPasswordSaving(false)
    }
  }

  /* ── Render ── */
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Perfil</h1>

      {/* ── Hub: solo aparece la fila Admin si corresponde — misma pantalla
          para todos, oculta sin romper la consistencia de navegación. ── */}
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
        {isAdmin && (
          <Link
            to="/admin"
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <IconShield className="w-5 h-5 text-amber-500 shrink-0" />
            <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">Admin</span>
            {unreadFeedback > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold leading-none">
                {unreadFeedback > 99 ? '99+' : unreadFeedback}
              </span>
            )}
          </Link>
        )}
        <Link
          to="/feedback"
          className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <IconMessageSquare className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">Buzón de sugerencias</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <IconLogOut className="w-5 h-5 text-primary shrink-0" />
          <span className="flex-1 text-sm font-medium text-primary">Cerrar sesión</span>
        </button>
      </section>

      {/* ── Datos personales ── */}
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-5">Datos personales</h2>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden flex items-center justify-center shrink-0 ring-2 ring-primary/40">
            {photoURL
              ? <img src={optimizedImageUrl(photoURL, 200)} alt="Foto de perfil" loading="lazy" className="w-full h-full object-cover" />
              : <IconUsers className="w-10 h-10 text-gray-400" />
            }
          </div>
          <div className="space-y-1">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileSelected} className="hidden" />
            <button type="button" onClick={openPicker} disabled={photoUploading}
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
              {photoUploading ? 'Subiendo…' : 'Cambiar foto'}
            </button>
            {(photoError || pickError) && <p className="text-xs text-red-500">{photoError || pickError}</p>}
          </div>
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

        {/* Read-only fields */}
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Email</p>
            <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
              {user.email}
            </p>
          </div>

          {/* Name with edit button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nombre y apellido</p>
              <button
                type="button"
                onClick={() => setShowEditName(true)}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                <IconEdit className="w-3.5 h-3.5" /> Editar
              </button>
            </div>
            <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
              {profile ? `${profile.firstName} ${profile.lastName}`.trim() : (user.displayName || '—')}
            </p>
            {nameMessage && (
              <p className="text-xs text-green-500 flex items-center gap-1 mt-1">
                <IconCheckCircle className="w-3.5 h-3.5" /> {nameMessage}
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Fecha de nacimiento</p>
            <p className="text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
              {birthDisplay}
            </p>
          </div>
        </div>
      </section>

      {/* ── Cuentas vinculadas ── */}
      <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Cuentas vinculadas</h2>
        <div className="space-y-3">

          {/* Google */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Google</p>
                <p className="text-xs text-gray-500">{hasGoogle ? 'Cuenta vinculada' : 'No vinculada'}</p>
              </div>
            </div>
            {hasGoogle ? (
              hasEmail && (
                <button
                  onClick={() => handleUnlink('google.com')}
                  disabled={unlinkLoading}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  Desvincular
                </button>
              )
            ) : (
              <button
                onClick={handleLinkGoogle}
                disabled={googleLinking}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
              >
                <IconLink className="w-3.5 h-3.5" />
                {googleLinking ? 'Vinculando…' : 'Vincular'}
              </button>
            )}
          </div>
          {googleLinkError && <p className="text-xs text-red-500">{googleLinkError}</p>}

          {/* Email / Contraseña */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M2 8l10 7 10-7" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Email y contraseña</p>
                  <p className="text-xs text-gray-500">{hasEmail ? 'Cuenta vinculada' : 'No vinculada'}</p>
                </div>
              </div>
              {hasEmail ? (
                hasGoogle && (
                  <button
                    onClick={() => handleUnlink('password')}
                    disabled={unlinkLoading}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    Desvincular
                  </button>
                )
              ) : (
                <button
                  onClick={() => setShowAddPassword((v) => !v)}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  <IconLink className="w-3.5 h-3.5" />
                  Agregar contraseña
                </button>
              )}
            </div>

            {/* Add password mini-form */}
            {showAddPassword && !hasEmail && (
              <form onSubmit={handleAddPassword} className="mt-3 space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  placeholder="Nueva contraseña"
                  aria-label="Nueva contraseña"
                  value={newLinkPassword}
                  onChange={(e) => setNewLinkPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-gray-400">{PASSWORD_HINT}</p>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  placeholder="Confirmar contraseña"
                  aria-label="Confirmar contraseña"
                  value={confirmLinkPassword}
                  onChange={(e) => setConfirmLinkPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                {linkPasswordError && <p className="text-xs text-red-500">{linkPasswordError}</p>}
                <button type="submit" disabled={linkPasswordSaving}
                  className="w-full bg-primary text-white rounded-md py-1.5 text-sm font-medium disabled:opacity-50">
                  {linkPasswordSaving ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </form>
            )}
            {linkPasswordMsg && (
              <p className="text-xs text-green-500 flex items-center gap-1 mt-2">
                <IconCheckCircle className="w-3.5 h-3.5" /> {linkPasswordMsg}
              </p>
            )}
          </div>

          {unlinkError && <p className="text-xs text-red-500">{unlinkError}</p>}
        </div>
      </section>

      {/* ── Cambiar contraseña ── */}
      {hasEmail && (
        <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Cambiar contraseña</h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="change-password-current" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contraseña actual</label>
              <input id="change-password-current" type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label htmlFor="change-password-new" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nueva contraseña</label>
              <input id="change-password-new" type="password" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />
              <p className="text-xs text-gray-400 mt-1">{PASSWORD_HINT}</p>
            </div>
            <div>
              <label htmlFor="change-password-confirm" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirmar nueva contraseña</label>
              <input id="change-password-confirm" type="password" required autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            {passwordError   && <p className="text-sm text-red-500">{passwordError}</p>}
            {passwordMessage && (
              <p className="text-sm text-green-500 flex items-center gap-1">
                <IconCheckCircle className="w-4 h-4" /> {passwordMessage}
              </p>
            )}
            <button type="submit" disabled={passwordSaving}
              className="bg-primary text-white rounded-md px-4 py-2 font-medium hover:bg-primary-dark transition-colors disabled:opacity-50">
              {passwordSaving ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </form>
        </section>
      )}

      {/* Edit name modal */}
      {showEditName && (
        <EditNameModal
          initial={{ firstName: profile?.firstName || '', lastName: profile?.lastName || '' }}
          onSave={handleSaveName}
          onClose={() => setShowEditName(false)}
        />
      )}
    </div>
  )
}
