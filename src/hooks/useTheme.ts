// Wrapper fino sobre el ThemeContext (src/contexts/ThemeContext.tsx) —
// mantiene este import path por si algo lo referencia, pero la
// implementación real (Provider, resolución de 'system', persistencia)
// vive en el Context. Ver ThemeContext.tsx para el porqué de usar Context
// en vez de un useState standalone.
export { useTheme } from '../contexts/ThemeContext'
export type { ThemePreference } from '../contexts/ThemeContext'
