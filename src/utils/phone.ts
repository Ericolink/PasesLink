// Normaliza un teléfono (como se haya guardado: con "+", espacios, guiones,
// paréntesis, con o sin código de país) al formato que wa.me exige: solo
// dígitos, sin "+". Si el número quedó en 10 dígitos (formato local mexicano
// sin código de país) se le antepone "52" para no romper el enlace.
export function toWhatsAppPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `52${digits}`
  }
  return digits
}
