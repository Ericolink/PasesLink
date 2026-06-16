import { useEffect, useState } from 'react'

export type PaletteId = '1' | '2' | '3'

const PALETTE_KEY = 'preview_palette'

export function usePalette() {
  const [palette, setPaletteState] = useState<PaletteId | null>(() => {
    const stored = localStorage.getItem(PALETTE_KEY)
    return stored === '1' || stored === '2' || stored === '3' ? stored : null
  })

  useEffect(() => {
    const html = document.documentElement
    if (palette) {
      html.setAttribute('data-palette', palette)
      html.classList.add('dark')
      localStorage.setItem(PALETTE_KEY, palette)
    } else {
      html.removeAttribute('data-palette')
      const savedTheme = localStorage.getItem('theme')
      html.classList.toggle('dark', savedTheme === 'dark')
      localStorage.removeItem(PALETTE_KEY)
    }
  }, [palette])

  function setPalette(id: PaletteId | null) {
    setPaletteState((prev) => (prev === id ? null : id))
  }

  return { palette, setPalette }
}
