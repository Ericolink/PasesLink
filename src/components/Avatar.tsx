import { optimizedImageUrl } from '../utils/cloudinary'

export function Avatar({ name, photoURL, size = 32 }: { name: string; photoURL?: string; size?: number }) {
  if (photoURL) {
    return <img src={optimizedImageUrl(photoURL, size * 2)} alt={name} loading="lazy" className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }} />
  }
  // Fallbacks explícitos: EventWall.tsx renderiza sin InvitationThemeRoot
  // (y por lo tanto sin estas CSS vars definidas) para todos los templates
  // salvo cowboy/graduation — sin fallback, `var(--invite-accent)` resuelve
  // a un valor inválido ahí y el círculo queda sin color.
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
      style={{
        width: size,
        height: size,
        backgroundColor: 'var(--invite-accent-soft, rgba(255,20,100,.15))',
        color: 'var(--invite-accent, #FF1464)',
      }}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  )
}
