export const ADMIN_EMAIL = 'ericmunoz441@gmail.com'

export function isAdminEmail(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL
}
