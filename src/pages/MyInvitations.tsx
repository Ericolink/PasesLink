import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getUserInvitations } from '../firebase/userProfile'
import { useAuth } from '../hooks/useAuth'
import { optimizedImageUrl } from '../utils/cloudinary'
import { QRCodeCanvas } from 'qrcode.react'
import type { UserInvitation } from '../types'
import { IconCalendar } from '../components/Icons'

export function MyInvitations() {
  const { user } = useAuth()
  const [invitations, setInvitations] = useState<UserInvitation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    getUserInvitations(user.uid)
      .then(setInvitations)
      .finally(() => setLoading(false))
  }, [user?.uid])

  if (!user) return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <p className="text-gray-500">
        <Link to="/login" className="text-primary font-medium">Inicia sesión</Link> para ver tus invitaciones.
      </p>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Mis invitaciones</h1>

      {loading && <p className="text-gray-400 text-center py-8">Cargando...</p>}

      {!loading && invitations.length === 0 && (
        <div className="text-center py-16">
          <IconCalendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">Aún no tienes invitaciones guardadas.</p>
          <p className="text-xs text-gray-400 mt-1">
            Cuando te registres a un evento con ingreso libre, tu pase QR aparecerá aquí.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {invitations.map((inv) => (
          <div key={inv.eventId}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4 card-hover">
            {inv.eventCoverImage
              ? <img src={optimizedImageUrl(inv.eventCoverImage, 128)} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover shrink-0" />
              : <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <IconCalendar className="w-7 h-7 text-primary" />
                </div>
            }
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white truncate">{inv.eventName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{inv.eventDate} · {inv.eventLocation}</p>
              <p className="text-xs text-gray-400 mt-0.5">Registrado como: {inv.guestName}</p>
            </div>
            <div className="shrink-0">
              <Link
                to={inv.type === 'walkin' ? `/events/${inv.eventId}/join` : `/pass/${inv.eventId}/${inv.qrToken}`}
                className="block"
              >
                <QRCodeCanvas value={inv.qrToken} size={64} marginSize={2} className="rounded" />
                <p className="text-xs text-primary text-center mt-1">Ver pase</p>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
