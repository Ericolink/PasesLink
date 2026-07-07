import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteUserInvitation, getUserInvitations } from '../firebase/userProfile'
import { useAuth } from '../hooks/useAuth'
import { optimizedImageUrl } from '../utils/cloudinary'
import { QRCodeCanvas } from 'qrcode.react'
import type { UserInvitation } from '../types'
import { IconCalendar, IconTrash } from '../components/Icons'
import { LoadingInline } from '../components/LoadingInline'
import { EmptyState } from '../components/Empty'
import { formatDate } from '../utils/time'

function todayString() {
  return new Date().toISOString().split('T')[0]
}

export function MyInvitations() {
  const { user } = useAuth()
  const [invitations, setInvitations] = useState<UserInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<UserInvitation | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!user) return
    getUserInvitations(user.uid)
      .then(async (all) => {
        const today = todayString()
        const expired = all.filter((inv) => inv.eventDate < today)
        const active = all.filter((inv) => inv.eventDate >= today)
        if (expired.length > 0) {
          await Promise.all(expired.map((inv) => deleteUserInvitation(user.uid, inv.eventId)))
        }
        setInvitations(active)
      })
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  async function handleDelete(inv: UserInvitation) {
    if (!user) return
    setDeleting(true)
    try {
      await deleteUserInvitation(user.uid, inv.eventId)
      setInvitations((prev) => prev.filter((i) => i.eventId !== inv.eventId))
      setConfirmDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  if (!user) return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <p className="text-gray-500">
        <Link to="/login" className="text-primary font-medium">Inicia sesión</Link> para ver tus invitaciones.
      </p>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Mis invitaciones</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Tu agenda personal de eventos</p>

      {loading && <LoadingInline label="Cargando invitaciones…" />}

      {!loading && invitations.length === 0 && (
        <EmptyState
          icon={<IconCalendar className="w-12 h-12" />}
          title="Sin eventos próximos"
          description="Cuando te registres a un evento, tu pase QR aparecerá aquí."
        />
      )}

      <div className="space-y-4">
        {invitations.map((inv, index) => (
          <div key={inv.eventId} className="relative">
            <Link
              to={`/pass/${inv.eventId}/${inv.qrToken}`}
              className="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 card-hover"
            >
              {index === 0 && (
                <span className="absolute -top-2.5 left-4 bg-primary text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full shadow-sm">
                  Próximo
                </span>
              )}
              <div className="flex items-center gap-4 pr-8">
                {inv.eventCoverImage
                  ? <img src={optimizedImageUrl(inv.eventCoverImage, 128)} alt="" loading="lazy" crossOrigin="anonymous" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                  : <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <IconCalendar className="w-7 h-7 text-primary" />
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{inv.eventName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{formatDate(inv.eventDate)}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{inv.eventLocation}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Como: {inv.guestName}</p>
                </div>
                <div className="shrink-0 flex flex-col items-center">
                  <QRCodeCanvas value={inv.qrToken} size={52} marginSize={1} className="rounded" />
                  <p className="text-[10px] text-primary text-center mt-1 font-medium">Ver pase</p>
                </div>
              </div>
            </Link>

            <button
              onClick={() => setConfirmDelete(inv)}
              className="absolute top-2 right-2 p-2.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              aria-label="Eliminar invitación"
            >
              <IconTrash className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold mb-1 text-gray-900 dark:text-white">¿Eliminar esta invitación?</h2>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{confirmDelete.eventName}</p>
            <p className="text-xs text-gray-400 mt-0.5 mb-5">{formatDate(confirmDelete.eventDate)}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting}
                className="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
