import { useState } from 'react'
import { GuestSignupPrompt } from '../GuestSignupPrompt'
import { IconUserPlus } from '../accessibility/AccessibleIcon'
import type { GuestData } from '../../types'

interface Props {
  eventId: string
  guest: GuestData
}

// Barra flotante que sigue al invitado mientras hace scroll por TODA la
// invitación — a diferencia del banner de siempre (vivía solo arriba del
// pase, desaparecía del campo visual apenas se bajaba), esta se mantiene
// visible durante todo el recorrido para fomentar crear cuenta/iniciar
// sesión (pedido explícito). Sin botón de cerrar a propósito (pedido
// explícito: debe seguir ahí hasta que el invitado se registre o inicie
// sesión) — el caller (HousePartyPassLayout) es quien la deja de montar en
// cuanto `hasAccount` pasa a true, no hay otra forma de sacarla de encima.
export function InvitationAccountFab({ eventId, guest }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        className="fixed top-0 inset-x-0 z-40 border-b"
        style={{
          background: 'var(--invite-surface)',
          borderColor: 'var(--invite-border)',
          paddingTop: 'env(safe-area-inset-top)',
          boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)',
        }}
      >
        {/* Un solo control (no botón-dentro-de-botón): el "chip" de la
            derecha es un <span> con pinta de botón (mismo bg-[var(--invite-
            accent)] que usan los CTA primarios del tema — houseparty ya lo
            pinta con --invite-ink y le da hover/active vía templates.css),
            no un <button> anidado. Antes esto era puro texto y se leía como
            un rótulo informativo, no como algo tocable (pedido explícito de
            rediseñarlo). */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full max-w-sm mx-auto flex items-center gap-3 text-left px-4 py-2.5"
        >
          <span className="invite-icon-badge shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--invite-accent-soft)] text-[var(--invite-accent)]">
            <IconUserPlus className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0 text-xs font-medium leading-snug text-[var(--invite-text-muted)]">
            Guarda esta invitación en tu cuenta
          </span>
          <span className="shrink-0 min-h-9 inline-flex items-center rounded-full px-4 text-sm font-bold bg-[var(--invite-accent)]">
            Crear cuenta
          </span>
        </button>
      </div>

      {open && (
        <GuestSignupPrompt
          eventId={eventId}
          guest={guest}
          source="guest_pass"
          onDismiss={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
        />
      )}
    </>
  )
}
