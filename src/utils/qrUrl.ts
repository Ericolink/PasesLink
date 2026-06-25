export function buildPassUrl(eventId: string, qrToken: string): string {
  return `${window.location.origin}/pass/${eventId}/${qrToken}`
}

export function isArriveQr(decodedText: string, eventId: string): boolean {
  try {
    const url = new URL(decodedText)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[0] === 'events' && parts[1] === eventId && parts[2] === 'arrive'
  } catch {
    return false
  }
}

export function extractQrToken(decodedText: string, eventId: string): string | null {
  try {
    const url = new URL(decodedText)
    const parts = url.pathname.split('/').filter(Boolean)
    const passIndex = parts.indexOf('pass')
    if (passIndex === -1 || parts.length < passIndex + 3) return null
    const scannedEventId = parts[passIndex + 1]
    const qrToken = parts[passIndex + 2]
    if (scannedEventId !== eventId) return null
    return qrToken
  } catch {
    return null
  }
}
