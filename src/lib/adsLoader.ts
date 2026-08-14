declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

let scriptsInjected = false

// Inyecta UNA sola vez (flag de módulo, no por instancia de <AdSlot>) los
// dos scripts que Google requiere para servir anuncios con consentimiento:
// 1) Funding Choices — el CMP (banner de consentimiento) que Google exige
//    para servir anuncios a tráfico de EEA/UK/Suiza, incluso no
//    personalizados. Su apariencia/copy/geo-targeting se configuran enteros
//    del lado de la consola de AdSense ("Privacidad y mensajes"), no acá.
// 2) adsbygoogle.js — el script de anuncios en sí. Cargar Funding Choices
//    primero es el orden que documenta Google para que el consentimiento
//    esté resuelto antes de que se pida el primer anuncio.
// Nunca se llama si `clientId` viene vacío (ver AdSlot.tsx) — sin cuenta de
// AdSense configurada, ningún script de terceros se agrega al documento.
export function ensureAdSenseLoaded(clientId: string): void {
  if (scriptsInjected || typeof document === 'undefined') return
  scriptsInjected = true

  const pubId = clientId.replace(/^ca-/, '')
  const cmpScript = document.createElement('script')
  cmpScript.async = true
  cmpScript.src = `https://fundingchoicesmessages.google.com/i/${pubId}?ers=1`
  document.head.appendChild(cmpScript)

  const adsenseScript = document.createElement('script')
  adsenseScript.async = true
  adsenseScript.crossOrigin = 'anonymous'
  adsenseScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`
  document.head.appendChild(adsenseScript)
}

// Pide el anuncio para el <ins class="adsbygoogle"> montado más reciente.
// El try/catch es necesario de verdad acá (no defensivo de sobra): AdSense
// lanza si se llama dos veces sobre el mismo elemento (StrictMode monta/
// desmonta/remonta en desarrollo) o si el bloqueador de anuncios impidió que
// adsbygoogle.js cargara — en ningún caso debe tumbar el render de la página.
export function pushAdSlot(): void {
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({})
  } catch {
    // Ad blocker o doble push en StrictMode — el <ins> simplemente se queda vacío.
  }
}
