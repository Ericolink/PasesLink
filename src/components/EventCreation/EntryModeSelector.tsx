import { IconGlobe, IconShuffle, IconUsers } from '../Icons'
import type { ComponentType } from 'react'
import type { EntryMode } from '../../types'

interface ModeOption {
  id: EntryMode
  Icon: ComponentType<{ className?: string }>
  title: string
  badge: string
  description: string
}

const MODES: ModeOption[] = [
  {
    id: 'list',
    Icon: IconUsers,
    title: 'Controlar acceso',
    badge: 'Solo invitados con QR',
    description: 'Invita a personas específicas — fiesta privada, boda, evento corporativo cerrado.',
  },
  {
    id: 'open',
    Icon: IconGlobe,
    title: 'Acceso público',
    badge: 'Registro abierto a cualquiera',
    description: 'Cualquiera puede registrarse hasta llenar el cupo — evento público, feria, conferencia.',
  },
  {
    id: 'hybrid',
    Icon: IconShuffle,
    title: 'Ambos modos',
    badge: 'Invitados + registro abierto',
    description: 'Invitados especiales Y el público general también puede registrarse.',
  },
]

interface EntryModeSelectorProps {
  value: EntryMode
  onChange: (mode: EntryMode) => void
}

export function EntryModeSelector({ value, onChange }: EntryModeSelectorProps) {
  return (
    <div className="space-y-3">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
            value === mode.id
              ? 'border-primary ring-2 ring-primary/20 bg-primary/5 dark:bg-primary/10'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <div className="flex items-start gap-3">
            <mode.Icon
              className={`w-6 h-6 flex-shrink-0 mt-0.5 ${
                value === mode.id ? 'text-primary' : 'text-gray-400 dark:text-gray-500'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {mode.title}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium">
                  {mode.badge}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {mode.description}
              </p>
            </div>
            <div
              className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                value === mode.id ? 'border-primary bg-primary' : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              {value === mode.id && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
