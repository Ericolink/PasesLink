// Divisor tipo "boarding pass" (semicírculos + línea punteada) compartido
// entre la tarjeta en pantalla (GuestPass.tsx) y el boleto exportable
// (GuestPassTicket.tsx). Debe montarse como hijo directo de `.invite-card`
// en ambos lugares: templates.css tiene selectores estructurales
// (`.invite-card > .relative.flex.items-center > :first-child/:last-child`)
// que dependen de esa posición exacta para el glow de houseparty.
export function PerforatedDivider() {
  return (
    <div className="relative flex items-center" style={{ marginLeft: '-1px', marginRight: '-1px' }}>
      <div
        className="shrink-0 w-5 h-5 rounded-full border-2 -ml-2.5"
        style={{ background: 'var(--invite-page-bg)', borderColor: 'var(--invite-border)' }}
      />
      <div
        className="flex-1 border-t-2"
        style={{ borderColor: 'var(--invite-border)', borderTopStyle: 'dashed' }}
      />
      <div
        className="shrink-0 w-5 h-5 rounded-full border-2 -mr-2.5"
        style={{ background: 'var(--invite-page-bg)', borderColor: 'var(--invite-border)' }}
      />
    </div>
  )
}
