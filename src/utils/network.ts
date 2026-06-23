export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const code = (err as { code?: string } | undefined)?.code
  return code === 'unavailable' || code === 'deadline-exceeded'
}
