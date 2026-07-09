import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteUserInvitation, getUserInvitations } from '../firebase/userProfile'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { optimizedImageUrl } from '../utils/cloudinary'
import { QRCodeCanvas } from 'qrcode.react'
import type { UserInvitation } from '../types'
import { IconCalendar, IconTrash } from '../components/Icons'
import { LoadingInline } from '../components/LoadingInline'
import { EmptyState } from '../components/Empty'
import { EventTicketCard } from '../components/EventTicketCard'
import { formatDate } from '../utils/time'

function todayString() {
  return new Date().toISOString().split('T')[0]
}

export function MyInvitations() {
  useDocumentTitle('Mis invitaciones')
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
            <EventTicketCard
              href={`/pass/${inv.eventId}/${inv.qrToken}`}
              index={index}
              date={inv.eventDate}
              templateId={inv.eventTemplateId}
              accentColor={inv.eventAccentColor}
              highlight={index === 0}
              title={inv.eventName}
              subtitle={`${formatDate(inv.eventDate)} · ${inv.eventLocation}`}
              body={
                <div className="flex items-center gap-4">
                  {inv.eventCoverImage
                    ? <img src={optimizedImageUrl(inv.eventCoverImage, 128)} alt="" loading="lazy" crossOrigin="anonymous" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    : <div className="w-12 h-12 rounded-lg bg-[var(--invite-accent-soft,rgba(255,20,100,.1))] flex items-center justify-center shrink-0">
                        <IconCalendar className="w-5 h-5 text-[var(--invite-accent,#FF1464)]" />
                      </div>
                  }
                  <p className="flex-1 min-w-0 text-xs text-[var(--invite-text-muted,#6b7280)] truncate">Como: {inv.guestName}</p>
                  <div className="shrink-0 flex flex-col items-center">
                    <QRCodeCanvas value={inv.qrToken} size={52} marginSize={1} className="rounded" />
                    <p className="text-[10px] text-[var(--invite-accent,#FF1464)] text-center mt-1 font-medium">Ver pase</p>
                  </div>
                </div>
              }
            />

            {/* Colores fijos (no dark:): el ticket ahora tiene su propio fondo
                oscuro/temático sin importar el modo claro/oscuro de la app. */}
            <button
              onClick={() => setConfirmDelete(inv)}
              className="absolute top-2 right-2 p-2.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
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
