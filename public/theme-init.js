// Anti-FOUC: aplica la clase `.dark` antes del primer paint, sin esperar a
// que React monte. Archivo servido desde `/` (no inline) a propósito: el CSP
// de firebase.json es `script-src 'self' 'unsafe-eval' ...` sin
// 'unsafe-inline' — un <script> inline se bloquearía en producción. La
// regla de "sin preferencia guardada, seguir prefers-color-scheme del SO"
// DEBE coincidir con getStoredPreference() en src/contexts/ThemeContext.tsx.
(function () {
  try {
    var pref = localStorage.getItem('theme')
    var isDark
    if (pref === 'light') isDark = false
    else if (pref === 'dark') isDark = true
    else isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.classList.toggle('dark', isDark)
  } catch (e) {
    document.documentElement.classList.add('dark')
  }
})()
