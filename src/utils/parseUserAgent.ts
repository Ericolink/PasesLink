// Categorías cerradas de "Dispositivos" del Centro de Control (ver
// src/firebase/deviceStats.ts) — a propósito solo las pedidas
// (Android/iPhone/iPad/Windows/macOS/Linux, Chrome/Safari/Firefox/Edge), sin
// sumar una librería como ua-parser-js (~20KB) para un catálogo tan chico y
// fijo. Regex explícitas, sin ambición de cubrir todos los user-agents del
// mundo — un caso "Other" siempre es una respuesta válida, nunca un crash.
export type DeviceOs = 'android' | 'ios' | 'windows' | 'mac' | 'linux' | 'other'
export type DeviceBrowser = 'chrome' | 'safari' | 'firefox' | 'edge' | 'other'

export function parseUserAgent(userAgent: string): { os: DeviceOs; browser: DeviceBrowser } {
  const ua = userAgent || ''
  return { os: detectOs(ua), browser: detectBrowser(ua) }
}

function detectOs(ua: string): DeviceOs {
  if (/Android/i.test(ua)) return 'android'
  // iPadOS 13+ se anuncia como Macintosh con soporte táctil — sin acceso al
  // DOM acá (esto corre también en tests), así que iPad entra por su propio
  // token clásico; los iPad "nuevo estilo" quedan agrupados con macOS, que
  // es una degradación aceptable (ambos son Apple, ninguno es Android).
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac'
  if (/Linux/i.test(ua)) return 'linux'
  return 'other'
}

function detectBrowser(ua: string): DeviceBrowser {
  // Orden importa: Edge y la mayoría de navegadores basados en Chromium
  // incluyen "Chrome" en su UA, y Chrome en iOS incluye "Safari" — cada
  // marca distintiva se revisa antes que las genéricas que la contendrían.
  if (/Edg\//i.test(ua)) return 'edge'
  if (/Firefox\//i.test(ua)) return 'firefox'
  if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) return 'chrome'
  if (/Safari\//i.test(ua)) return 'safari'
  return 'other'
}
