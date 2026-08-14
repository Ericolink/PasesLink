import { useCallback, useEffect, useRef, useState } from 'react'

// Hook compartido para botones "Copiar" con feedback visual temporal.
// `key` identifica cuál de varios botones copió último (ej. banco vs.
// CLABE vs. concepto en TransferInfoDisplay), así una sola instancia del
// hook alcanza para todo un bloque de campos en vez de un estado por campo.
export function useCopyToClipboard(resetMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  const copy = useCallback((key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopiedKey(null), resetMs)
    })
  }, [resetMs])

  return { copiedKey, copy }
}
