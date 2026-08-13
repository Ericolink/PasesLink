import { describe, expect, it } from 'vitest'
import { escapeHtmlAttr, injectMetaTags } from './injectMetaTags.js'
import type { LinkMetadata } from './types.js'

// Recorte representativo del <head> real de index.html — suficiente para
// probar que el reemplazo es dirigido (solo estos 8 tags cambian) sin
// depender del archivo completo.
const SAMPLE_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/Icon.png" />
    <title>PaseLink - Gestión de invitados para eventos</title>
    <meta name="description" content="Crea eventos, envía invitaciones digitales con QR y controla el acceso de tus invitados en tiempo real. Gratis y sin descargas." />
    <link rel="canonical" href="https://app-pases-9e6e7.web.app/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="PaseLink" />
    <meta property="og:title" content="PaseLink - Gestión de invitados para eventos" />
    <meta property="og:description" content="Crea eventos, envía invitaciones digitales con QR y controla el acceso de tus invitados en tiempo real." />
    <meta property="og:url" content="https://app-pases-9e6e7.web.app/" />
    <meta property="og:image" content="https://app-pases-9e6e7.web.app/icons/pwa-512.png" />
    <meta property="og:locale" content="es_MX" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="PaseLink - Gestión de invitados para eventos" />
    <meta name="twitter:description" content="Crea eventos, envía invitaciones digitales con QR y controla el acceso de tus invitados en tiempo real." />
    <meta name="twitter:image" content="https://app-pases-9e6e7.web.app/icons/pwa-512.png" />
    <script type="application/ld+json">
    { "@context": "https://schema.org", "@type": "WebApplication" }
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

const META: LinkMetadata = {
  title: 'Eric Muñoz te invita a Baile Improvisado | PaseLink',
  ogTitle: 'Eric Muñoz te invita a Baile Improvisado',
  ogDescription: 'Regístrate y obtén tu pase con código QR para el evento.',
  ogImage: 'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_auto/v1/photo.jpg',
  twitterTitle: 'Eric Muñoz te invita a Baile Improvisado',
  twitterDescription: 'Regístrate y obtén tu pase con código QR para el evento.',
  twitterImage: 'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_auto/v1/photo.jpg',
}
const CANONICAL_URL = 'https://app-pases-9e6e7.web.app/e/evt-123'

describe('injectMetaTags', () => {
  it('replaces exactly the 8 targeted tags and leaves the rest untouched', () => {
    const html = injectMetaTags(SAMPLE_HTML, META, CANONICAL_URL)

    expect(html).toContain('<title>Eric Muñoz te invita a Baile Improvisado | PaseLink</title>')
    expect(html).toContain(`<meta property="og:title" content="${META.ogTitle}" />`)
    expect(html).toContain(`<meta property="og:description" content="${META.ogDescription}" />`)
    expect(html).toContain(`<meta property="og:image" content="${META.ogImage}" />`)
    expect(html).toContain(`<meta property="og:url" content="${CANONICAL_URL}" />`)
    expect(html).toContain(`<meta name="twitter:title" content="${META.twitterTitle}" />`)
    expect(html).toContain(`<meta name="twitter:description" content="${META.twitterDescription}" />`)
    expect(html).toContain(`<meta name="twitter:image" content="${META.twitterImage}" />`)

    // Todo lo demás queda exactamente igual.
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain('<meta property="og:site_name" content="PaseLink" />')
    expect(html).toContain('<meta property="og:locale" content="es_MX" />')
    expect(html).toContain('<meta name="twitter:card" content="summary" />')
    expect(html).toContain('<meta name="description" content="Crea eventos, envía invitaciones digitales con QR y controla el acceso de tus invitados en tiempo real. Gratis y sin descargas." />')
    expect(html).toContain('"@type": "WebApplication"')
  })

  it('escapes an event/inviter name that contains HTML-breaking characters', () => {
    const adversarialMeta: LinkMetadata = {
      ...META,
      ogTitle: '<script>alert(1)</script> te invita a Ana " onmouseover="x"',
      title: '<script>alert(1)</script> te invita a Ana " onmouseover="x" | PaseLink',
    }

    const html = injectMetaTags(SAMPLE_HTML, adversarialMeta, CANONICAL_URL)

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('onmouseover="x"')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot;')
  })

  it('escapes a plain ampersand in a name', () => {
    const meta: LinkMetadata = { ...META, ogTitle: 'AT&T Events te invita a Fiesta' }
    const html = injectMetaTags(SAMPLE_HTML, meta, CANONICAL_URL)
    expect(html).toContain('AT&amp;T Events te invita a Fiesta')
  })
})

describe('escapeHtmlAttr', () => {
  it('escapes &, <, >, and "', () => {
    expect(escapeHtmlAttr(`a & b < c > d "e"`)).toBe('a &amp; b &lt; c &gt; d &quot;e&quot;')
  })
})
