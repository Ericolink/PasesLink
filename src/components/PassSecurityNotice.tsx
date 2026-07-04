import { IconShield } from './Icons'

// Aviso discreto de seguridad: vive dentro de la boarding-pass card (mismas
// variables --invite-* que el resto del tema), así que aparece tanto en la
// vista en pantalla como en la captura de descarga sin necesitar lógica
// aparte por plantilla.
export function PassSecurityNotice() {
  return (
    <p
      className="mt-4 pt-3 border-t flex items-center justify-center gap-1.5 text-[11px] leading-snug text-[var(--invite-text-muted)]"
      style={{ borderColor: 'var(--invite-border)' }}
    >
      <IconShield className="w-3.5 h-3.5 shrink-0" />
      Pase personal e intransferible. No lo compartas — preséntalo solo el día del evento.
    </p>
  )
}
