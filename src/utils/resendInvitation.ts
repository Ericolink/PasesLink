import type { CountryCode } from 'libphonenumber-js/min'
import { buildPassUrl } from './qrUrl'
import { toWhatsAppPhone } from './phone'

// Reenvío de una invitación ya existente (mismo qrToken, no se genera nada
// nuevo) para el invitado que se autoregistró desde un navegador integrado
// (Instagram/TikTok/Facebook) y perdió el link al cerrarlo. wa.me/mailto en
// vez de EmailJS a propósito: el mensaje sale de la cuenta del organizador
// (más confianza que un remitente "no-reply") y no consume el cupo de 2
// templates del plan gratis de EmailJS (ver .env.example).
export function buildResendMessage(guestName: string, eventName: string, eventId: string, qrToken: string): string {
  const passUrl = buildPassUrl(eventId, qrToken)
  return `Hola ${guestName} 👋\n\nAquí tienes nuevamente tu invitación para el evento *${eventName}*.\n\nPuedes acceder a tu pase desde el siguiente enlace:\n\n${passUrl}\n\nGuárdalo para tenerlo disponible el día del evento.\n\nNos vemos pronto 🎉`
}

export function buildResendWhatsAppUrl(phone: string, message: string, phoneCountry?: string): string {
  const clean = toWhatsAppPhone(phone, phoneCountry as CountryCode | undefined)
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`
}

export function buildResendMailtoUrl(email: string, eventName: string, message: string): string {
  const subject = `Tu invitación para ${eventName}`
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
}
