// Navegadores internos (WebView) de apps que reescriben el link de la
// invitación — cada uno usa su propio storage aislado del Safari/Chrome del
// sistema, así que el mismo invitado genera un "dispositivo" nuevo cada vez
// que abre el enlace desde una app distinta (ver claimGuestPass en
// src/firebase/guests.ts). Detectarlos permite ofrecerle una salida directa
// al navegador real en vez de dejar que acumule dispositivos sin necesidad.
const IN_APP_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Instagram', pattern: /Instagram/i },
  { name: 'Facebook', pattern: /FBAN|FBAV|FB_IAB/i },
  { name: 'TikTok', pattern: /BytedanceWebview|MusicalLyLite|TikTok/i },
  { name: 'WhatsApp', pattern: /WhatsApp/i },
  { name: 'Telegram', pattern: /Telegram/i },
  { name: 'Line', pattern: /\bLine\// },
]

export interface InAppBrowserInfo {
  isInApp: boolean
  appName: string | null
}

export function detectInAppBrowser(userAgent: string): InAppBrowserInfo {
  for (const { name, pattern } of IN_APP_PATTERNS) {
    if (pattern.test(userAgent)) return { isInApp: true, appName: name }
  }
  return { isInApp: false, appName: null }
}

// Solo Android puede "forzarse" a salir a Chrome desde JS (esquema
// intent://) — iOS no expone ninguna API para eso desde una página; ahí la
// única salida real es el menú ••• del navegador interno ("Abrir en
// Safari"), que ya traen Instagram/Facebook/TikTok en iOS.
export function buildAndroidChromeIntentUrl(currentUrl: string, userAgent: string): string | null {
  if (!/Android/i.test(userAgent)) return null
  const url = new URL(currentUrl)
  const withoutScheme = `${url.host}${url.pathname}${url.search}`
  return `intent://${withoutScheme}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`
}
