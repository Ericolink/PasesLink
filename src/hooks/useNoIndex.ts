import { useEffect } from 'react'

// Para pantallas públicas que no deben aparecer en buscadores (pase de un
// invitado con QR, muro del evento, formulario de auto-registro, estado de
// lista de espera, etc.). robots.txt ya bloquea el crawling de estas rutas,
// pero eso NO evita que Google indexe la URL "a ciegas" (sin snippet) si la
// descubre por otro medio — <meta name="robots" content="noindex"> es la
// única forma confiable de garantizar que no quede indexada. No reemplaza
// ningún control de seguridad: los datos reales siguen protegidos por
// Firebase Auth y Firestore Rules, esto es solo higiene de SEO.
export function useNoIndex(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const tag = document.querySelector('meta[name="robots"]')
    if (!tag) return
    const prev = tag.getAttribute('content')
    tag.setAttribute('content', 'noindex, nofollow')
    return () => {
      if (prev !== null) tag.setAttribute('content', prev)
    }
  }, [enabled])
}
