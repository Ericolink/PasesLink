import { useEffect } from 'react'

// Dominio de producción real (ver .firebaserc / firebase.json — sin dominio
// custom todavía). Único punto de verdad para canonical/OG dinámicos; si se
// agrega un dominio propio más adelante, cambia solo acá (más index.html y
// functions/src/http/eventJoinMeta.ts, que no pueden importar este módulo).
export const SITE_URL = 'https://app-pases-9e6e7.web.app'

interface SeoMetaOptions {
  /** Sin el sufijo " · PaseLink" — se agrega acá, igual que useDocumentTitle. */
  title: string
  description: string
  /** Ruta canónica sin dominio ni query params, ej. "/" o "/terminos". */
  path: string
}

// Para las páginas públicas indexables (Landing, Register, Login, Terms,
// Privacy): además del título, actualiza description y canonical en el
// <head> ya presente en index.html. Googlebot ejecuta JS y lee el <head> en
// el momento del render, así que mutarlo en un efecto es válido para SEO —
// mismo criterio que useDocumentTitle, restaurando el valor anterior al
// desmontar para no “pisar” la siguiente pantalla.
export function useSeoMeta({ title, description, path }: SeoMetaOptions) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = `${title} · PaseLink`

    const descriptionTag = document.querySelector('meta[name="description"]')
    const prevDescription = descriptionTag?.getAttribute('content') ?? null
    descriptionTag?.setAttribute('content', description)

    const canonicalTag = document.querySelector('link[rel="canonical"]')
    const prevCanonical = canonicalTag?.getAttribute('href') ?? null
    canonicalTag?.setAttribute('href', `${SITE_URL}${path}`)

    return () => {
      document.title = prevTitle
      if (prevDescription !== null) descriptionTag?.setAttribute('content', prevDescription)
      if (prevCanonical !== null) canonicalTag?.setAttribute('href', prevCanonical)
    }
  }, [title, description, path])
}
