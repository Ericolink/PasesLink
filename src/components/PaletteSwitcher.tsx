import { useState } from 'react'
import { usePalette } from '../hooks/usePalette'
import type { PaletteId } from '../hooks/usePalette'

const PALETTES: {
  id: PaletteId
  name: string
  colors: [string, string, string, string]
}[] = [
  {
    id: '1',
    name: 'Midnight Violet',
    colors: ['#362F4F', '#5B23FF', '#008BFF', '#E4FF30'],
  },
  {
    id: '2',
    name: 'Neon Galaxy',
    colors: ['#450693', '#8C00FF', '#FF3F7F', '#FFC400'],
  },
  {
    id: '3',
    name: 'Pico-8 Retro',
    colors: ['#1D2B53', '#FF004D', '#7E2553', '#FAEF5D'],
  },
]

export function PaletteSwitcher() {
  const { palette, setPalette } = usePalette()
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-5 left-5 z-50 flex flex-col items-start gap-2">
      {open && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3 space-y-2 animate-slide-in-up w-52">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pb-1">
            Paletas de color
          </p>
          {PALETTES.map((p) => {
            const active = palette === p.id
            return (
              <button
                key={p.id}
                onClick={() => setPalette(p.id)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-all text-left ${
                  active
                    ? 'bg-white/10 ring-1 ring-white/30'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="flex gap-1 shrink-0">
                  {p.colors.map((c) => (
                    <span
                      key={c}
                      className="w-4 h-4 rounded-full border border-white/20"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium text-gray-200 truncate">
                  {p.name}
                </span>
                {active && (
                  <span className="ml-auto text-xs text-green-400">✓</span>
                )}
              </button>
            )
          })}
          {palette && (
            <button
              onClick={() => setPalette(null)}
              className="w-full text-xs text-gray-500 hover:text-gray-300 text-center pt-1 transition-colors"
            >
              Restaurar estilo original
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        title="Cambiar paleta de colores"
        className="w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95 border border-white/20"
        style={{
          background: palette
            ? PALETTES.find((p) => p.id === palette)?.colors[1]
            : '#374151',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5 text-white"
        >
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
      </button>
    </div>
  )
}
