import { Avatar } from '../Avatar'
import type { GuestData } from '../../types'
import { guestDisplayName } from './guestGrouping'

// Pares claro/oscuro fijos (no CSS vars) para que respondan al toggle de
// tema `.dark` igual que el resto de la UI del organizador — a diferencia de
// Avatar.tsx, que usa `--invite-accent` porque su fallback vive en páginas
// públicas temadas (EventWall, WallSection, PhotoFeedCard), tema que no
// aplica acá.
const PALETTE = [
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300',
]

function hashedInitialsStyle(name: string): { bgClass: string; initials: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % PALETTE.length
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
  return { bgClass: PALETTE[hash], initials }
}

export function GuestAvatar({
  guest,
  size = 38,
}: {
  guest: Pick<GuestData, 'name' | 'lastName' | 'isGroup' | 'guestPhotoURL'>
  size?: number
}) {
  const displayName = guestDisplayName(guest)
  if (guest.guestPhotoURL) {
    return <Avatar name={displayName} photoURL={guest.guestPhotoURL} size={size} />
  }
  const { bgClass, initials } = hashedInitialsStyle(displayName)
  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${bgClass}`}
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  )
}
