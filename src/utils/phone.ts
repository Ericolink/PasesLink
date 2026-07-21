// Deja solo dígitos y un + inicial — formato que wa.me espera en la URL.
export function cleanPhone(raw: string): string {
  return raw.replace(/[^\d+]/g, '')
}
