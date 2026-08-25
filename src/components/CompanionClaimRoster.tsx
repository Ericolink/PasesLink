import { describeViewerClaimRole, getClaimableRoster } from '../utils/companionRoster'
import type { GuestData } from '../types'

interface Props {
  guest: GuestData
  currentUid: string | null
  onClaim: (personIndex: number) => void
  claimingIndex: number | null
  claimError: string | null
}

// Selector "¿Cuál de estas personas eres tú?" (ver PLAN de cuentas
// compartidas por invitación) — permite que cada persona de una invitación
// familiar/con acompañantes vincule SU PROPIA cuenta a su propio nombre,
// sin crear ninguna invitación ni QR nuevo (todos comparten el mismo
// `guest`/`qrToken` de siempre). No se muestra nada para una invitación de
// una sola persona (nada que elegir) ni sin sesión iniciada (reclamar
// requiere cuenta).
export function CompanionClaimRoster({ guest, currentUid, onClaim, claimingIndex, claimError }: Props) {
  if (!currentUid) return null
  const roster = getClaimableRoster(guest)
  if (roster.length < 2) return null

  const banner = describeViewerClaimRole(guest, currentUid)
  const unclaimed = roster.filter((row) => !row.claimedByUid)
  if (!banner && unclaimed.length === 0) return null

  return (
    <div
      className="w-full text-left rounded-lg border bg-[var(--invite-surface)] px-3 py-2.5 mb-4 text-sm space-y-2"
      style={{ borderColor: 'var(--invite-border)' }}
    >
      {banner && <p className="text-[var(--invite-text)]">{banner}</p>}
      {unclaimed.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-[var(--invite-text-muted)]">
            ¿Alguna de estas personas eres tú?
          </p>
          <ul className="space-y-1.5">
            {unclaimed.map((row) => (
              <li key={row.index} className="flex items-center justify-between gap-2">
                <span className="text-[var(--invite-text)]">{row.fullName}</span>
                <button
                  type="button"
                  onClick={() => onClaim(row.index)}
                  disabled={claimingIndex !== null}
                  className="shrink-0 min-h-11 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--invite-accent)', color: 'var(--invite-accent)' }}
                >
                  {claimingIndex === row.index ? 'Vinculando…' : 'Este soy yo'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {claimError && <p className="text-xs text-red-600 dark:text-red-400">{claimError}</p>}
    </div>
  )
}
