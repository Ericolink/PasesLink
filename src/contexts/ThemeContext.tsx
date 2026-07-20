import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

// Mismo default que public/theme-init.js (aplicado antes del primer paint,
// fuera de React) — si uno cambia sin el otro, vuelve el flash de tema
// incorrecto en la carga inicial. 'system' (no 'dark') para un usuario sin
// preferencia guardada: sigue el prefers-color-scheme del SO, y además
// quedará escrito así en localStorage (ver el useEffect de persistencia más
// abajo) — no queda "clavado" en oscuro la primera vez, y si el SO cambia
// de tema en caliente, la app lo sigue (mismo listener que ya existía).
function getStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

interface ThemeContextValue {
  preference: ThemePreference
  resolvedTheme: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(getStoredPreference)
  // Solo relevante en 'system' — se actualiza vía el listener de matchMedia
  // de abajo. resolvedTheme se deriva de esto en cada render, nunca se
  // guarda en un state propio (evitaría un doble render por cambio).
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, preference)
  }, [preference])

  // Solo en 'system' seguimos cambios en caliente del SO — en 'light'/'dark'
  // explícitos, la preferencia del usuario no debe moverse sola.
  useEffect(() => {
    if (preference !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    function handleChange(e: MediaQueryListEvent) {
      setSystemPrefersDark(e.matches)
    }
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [preference])

  // Memoizado: sin esto, cada render de ThemeProvider (uno de los providers
  // más altos del árbol) crea un objeto value nuevo y re-renderiza a TODOS
  // los consumidores de useTheme(), aunque preference/resolvedTheme no hayan
  // cambiado.
  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

// Hook colocado a propósito junto a su Provider (patrón estándar de
// Context); no vale la pena partir el archivo en 2 por esta regla de
// Fast Refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}
