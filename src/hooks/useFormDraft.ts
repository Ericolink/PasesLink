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
 *
 * `serverUpdatedAt` (opcional, en ms) es el `updatedAt` real del documento en
 * el servidor al momento de montar el formulario (ej. `event.updatedAt` en
 * EditEventForm). Si el draft local es más viejo que eso, significa que el
 * documento cambió en otro dispositivo/pestaña DESPUÉS de guardarse este
 * draft — se descarta en silencio en vez de ofrecer "continuar editando",
 * que sobreescribiría ese cambio más nuevo sin que el usuario lo note.
 */
export function useFormDraft<T>(storageKey: string, serverUpdatedAt?: number) {
  const [pendingDraft, setPendingDraft] = useState<DraftEnvelope<T> | null>(null)
  const lastSavedRef = useRef<string>('')

  // Lee localStorage (sistema externo) cuando storageKey queda disponible —
  // en EventCreate, `user` (y por lo tanto la key) se resuelve después del
  // primer render, así que no alcanza con un initializer de useState.
  // serverUpdatedAt deliberadamente NO está en las deps: solo importa su
  // valor al momento de esta lectura inicial — si cambiara más tarde (el
  // evento se actualiza mientras el formulario sigue abierto), no queremos
  // re-disparar la lectura de localStorage y revivir un draft ya descartado.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!storageKey) return
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    try {
      const draft = JSON.parse(raw) as DraftEnvelope<T>
      if (serverUpdatedAt && draft.savedAt < serverUpdatedAt) {
        localStorage.removeItem(storageKey)
        return
      }
      setPendingDraft(draft)
    } catch {
      localStorage.removeItem(storageKey)
    }
  }, [storageKey])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

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
