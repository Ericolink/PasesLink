import type { CountryCode } from 'libphonenumber-js/min'
import { buildPassUrl, buildWaitlistStatusUrl } from './qrUrl'
import { toWhatsAppPhone } from './phone'

// Reenvío de una invitación ya existente (mismo qrToken, no se genera nada
// nuevo) para el invitado que se autoregistró desde un navegador integrado
// (Instagram/TikTok/Facebook) y perdió el link al cerrarlo. wa.me/mailto a
// propósito: el mensaje sale de la cuenta del organizador (más confianza
// que un remitente "no-reply"), sin depender de un envío server-side.
export function buildResendMessage(guestName: string, eventName: string, eventId: string, qrToken: string): string {
  const passUrl = buildPassUrl(eventId, qrToken)
  return `Hola ${guestName} 👋\n\nAquí tienes nuevamente tu invitación para el evento *${eventName}*.\n\nPuedes acceder a tu pase desde el siguiente enlace:\n\n${passUrl}\n\nGuárdalo para tenerlo disponible el día del evento.\n\nNos vemos pronto 🎉`
}

// Mismo patrón que buildResendMessage, pero para una entrada de la lista de
// espera: todavía no tiene un pase, así que el link lleva al estado de su
// lugar en la fila (WaitlistStatus.tsx), no a un QR.
export function buildWaitlistResendMessage(entryName: string, eventName: string, eventId: string, waitlistToken: string): string {
  const statusUrl = buildWaitlistStatusUrl(eventId, waitlistToken)
  return `Hola ${entryName} 👋\n\nSigues en la lista de espera del evento *${eventName}*.\n\nPuedes ver el estado de tu lugar desde el siguiente enlace:\n\n${statusUrl}\n\nTe avisaremos por ahí apenas se libere un lugar.\n\nGracias por tu paciencia 🙏`
}

export function buildResendWhatsAppUrl(phone: string, message: string, phoneCountry?: string): string {
  const clean = toWhatsAppPhone(phone, phoneCountry as CountryCode | undefined)
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}

export function buildResendMailtoUrl(email: string, eventName: string, message: string): string {
  const subject = `Tu invitación para ${eventName}`
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
}
