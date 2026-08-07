// Recuperación de "chunk viejo" — el Service Worker (workbox, ver
// vite.config.ts) puede quedar en medio de su propia actualización justo
// cuando el navegador dispara un import() dinámico (cualquier página/sección
// lazy: Scanner, exportPdf, los charts del Centro de Control, etc.), y esa
// carrera hace que el chunk falle a cargar aunque el archivo exista
// perfectamente bien en el servidor (confirmado: no es un 404 real, es una
// intercepción del SW que falla). Vite emite `vite:preloadError` en `window`
// exactamente para este caso — ver
// https://vite.dev/guide/build.html#load-error-handling.
//
// Recarga UNA sola vez por sesión de pestaña (sessionStorage, no
// localStorage — cada pestaña nueva empieza sin el flag): si el problema
// persiste después de recargar, ya no es la carrera transitoria del SW sino
// algo genuinamente roto, y ahí sí conviene que el usuario vea el
// ErrorBoundary en vez de quedar en un loop de recargas infinito.
const RELOAD_GUARD_KEY = 'pl_chunk_reload_attempted'

export function installChunkReloadRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return // ya se intentó en esta pestaña, dejar que el ErrorBoundary lo muestre
    event.preventDefault()
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
    window.location.reload()
  })
}
