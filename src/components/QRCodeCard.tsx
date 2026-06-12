import { QRCodeSVG } from 'qrcode.react'
import type { GuestData } from '../types'

export function QRCodeCard({ eventId, guest }: { eventId: string; guest: GuestData }) {
  const passUrl = `${window.location.origin}/pass/${eventId}/${guest.qrToken}`

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white flex flex-col items-center text-center">
      <QRCodeSVG value={passUrl} size={140} />
      <p className="mt-3 font-medium text-gray-900">{guest.name}</p>
      <a href={passUrl} target="_blank" rel="noreferrer" className="text-xs text-primary mt-1 break-all">
        {passUrl}
      </a>
    </div>
  )
}
