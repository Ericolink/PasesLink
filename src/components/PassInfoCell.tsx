// Celda de info estilo "boarding pass" (etiqueta + valor), compartida entre
// la tarjeta en pantalla (GuestPass.tsx) y el boleto exportable
// (GuestPassTicket.tsx).
export function PassInfoCell({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="invite-pass-label text-[10px] uppercase tracking-widest font-semibold text-[var(--invite-text-muted)] mb-0.5">{label}</p>
      <p className="invite-pass-value text-sm font-medium text-[var(--invite-text)] leading-snug">{value}</p>
    </div>
  )
}
