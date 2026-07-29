import type { TransportInfo } from '../types'

interface Props {
  transport: TransportInfo
}

function hasContent(transport: TransportInfo): boolean {
  return !!(transport.options?.length || transport.parkingInfo?.trim() || transport.specialInstructions?.length)
}

// Body puro (sin título propio): el título/ícono de esta información los
// pone el EventInfoSection que lo envuelve en el panel.
export function TransportSection({ transport }: Props) {
  if (!hasContent(transport)) return null

  return (
    <div className="space-y-3">
      {!!transport.options?.length && (
        <ul className="space-y-1.5">
          {transport.options.map((opt) => (
            <li key={opt.id} className="text-sm" style={{ color: 'var(--invite-text)' }}>
              <span className="font-medium">{opt.label}</span>
              {opt.description && <span style={{ color: 'var(--invite-text-muted)' }}> — {opt.description}</span>}
            </li>
          ))}
        </ul>
      )}

      {transport.parkingInfo?.trim() && (
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--invite-text)' }}>Estacionamiento</p>
          <p className="text-sm whitespace-pre-line" style={{ color: 'var(--invite-text-muted)' }}>{transport.parkingInfo}</p>
        </div>
      )}

      {!!transport.specialInstructions?.length && (
        <div>
          <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--invite-text)' }}>Indicaciones especiales</p>
          <ul className="text-sm list-disc pl-4 space-y-0.5" style={{ color: 'var(--invite-text-muted)' }}>
            {transport.specialInstructions.map((instruction, i) => (
              <li key={i}>{instruction}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
