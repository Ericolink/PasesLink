import type { WallMessageType } from '../types'
import { WALL_TYPE_CONFIG } from '../utils/wallMessageTypes'

interface Props {
  value: WallMessageType
  onChange: (type: WallMessageType) => void
}

// Chips para elegir el tipo de publicación del formulario del muro — antes
// duplicados en WallSection.tsx y EventWall.tsx con el mismo tamaño (px-3
// py-1, ícono de 12px), demasiado chico para tocar cómodo en celular.
export function WallTypeChipSelector({ value, onChange }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      {(Object.keys(WALL_TYPE_CONFIG) as WallMessageType[]).map((t) => {
        const cfg = WALL_TYPE_CONFIG[t]
        const active = value === t
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`flex items-center gap-1.5 min-h-11 text-sm rounded-full px-3.5 py-2 font-medium transition-all active:scale-95 ${
              active ? cfg.color + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <cfg.Icon className="w-4 h-4" />
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}
