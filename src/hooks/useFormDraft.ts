import { useCallback, useEffect, useRef, useState } from 'react'

export interface DraftEnvelope<T> {
  savedAt: number
  fields: T
}

/**
 * Persiste el estado de un formulario largo en localStorage para que un cierre
 * accidental de la pestaña (o un fallo de red al guardar) no borre lo ya
 * escrito. `storageKey` debe identificar de forma única la sesión de
 * formulario (ej. por usuario + evento) para no mezclar borradores ajenos.
 */
export function useFormDraft<T>(storageKey: string) {
  const [pendingDraft, setPendingDraft] = useState<DraftEnvelope<T> | null>(null)
  const lastSavedRef = useRef<string>('')

  // Lee localStorage (sistema externo) cuando storageKey queda disponible —
  // en EventCreate, `user` (y por lo tanto la key) se resuelve después del
  // primer render, así que no alcanza con un initializer de useState.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!storageKey) return
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    try {
      setPendingDraft(JSON.parse(raw) as DraftEnvelope<T>)
    } catch {
      localStorage.removeItem(storageKey)
    }
  }, [storageKey])
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveDraft = useCallback((fields: T) => {
    const serialized = JSON.stringify(fields)
    if (serialized === lastSavedRef.current) return
    lastSavedRef.current = serialized
    localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), fields }))
  }, [storageKey])

  const clearDraft = useCallback(() => {
    localStorage.removeItem(storageKey)
    lastSavedRef.current = ''
  }, [storageKey])

  const dismissPrompt = useCallback(() => setPendingDraft(null), [])

  return { pendingDraft, saveDraft, clearDraft, dismissPrompt }
}
