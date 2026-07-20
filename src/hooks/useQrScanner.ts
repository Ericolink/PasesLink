import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

const SCAN_COOLDOWN_MS = 2500

interface Options {
  // El auto-arranque solo debe dispararse una vez que el evento/usuario/
  // permiso están listos — el llamador combina esas 3 condiciones en un
  // solo booleano (antes el efecto dependía de las 3 por separado).
  canAutoStart: boolean
  onDecode: (decodedText: string) => Promise<void>
}

// Extraído de Scanner.tsx (auditoría de escalabilidad, hallazgo F13): dueño
// del ciclo de vida de la instancia de Html5Qrcode (arranque, auto-arranque
// al cargar el evento, cooldown entre lecturas para no reprocesar el mismo
// frame, limpieza al desmontar) — sin ninguna lógica de negocio, que sigue
// viviendo en Scanner.tsx (processQr, pasado acá como onDecode). onDecode se
// registra UNA sola vez dentro de scanner.start() (igual que antes de esta
// extracción) — sigue siendo responsabilidad de processQr leer estado fresco
// vía refs en vez de depender de que este callback se re-registre.
export function useQrScanner({ canAutoStart, onDecode }: Options) {
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const startingRef = useRef(false)
  const cooldownRef = useRef(false)
  const hasAutoStartedRef = useRef(false)

  useEffect(() => {
    return () => { void stopScanning() }
  }, [])

  useEffect(() => {
    if (!canAutoStart || hasAutoStartedRef.current) return
    hasAutoStartedRef.current = true
    void startScanning()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAutoStart])

  async function startScanning() {
    // Evita inicializar dos instancias de Html5Qrcode en paralelo si el
    // usuario pulsa "Reintentar"/"Activar cámara" varias veces antes de que
    // la primera llamada a scanner.start() resuelva (sea éxito o error).
    if (startingRef.current) return
    startingRef.current = true
    setCameraError(null)
    const scanner = new Html5Qrcode('qr-reader', { verbose: false })
    scannerRef.current = scanner
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10 },
        async (decodedText) => {
          if (cooldownRef.current) return
          cooldownRef.current = true
          await onDecode(decodedText)
          setTimeout(() => { cooldownRef.current = false }, SCAN_COOLDOWN_MS)
        },
        () => {},              // ignorar errores de frame (normales durante el escaneo)
      )
      setScanning(true)
    } catch {
      setCameraError('camera_unavailable')
      try { scanner.clear() } catch { /* ignore */ }
      scannerRef.current = null
    } finally {
      startingRef.current = false
    }
  }

  async function stopScanning() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch { /* already stopped */ }
      scannerRef.current = null
    }
    setScanning(false)
  }

  return { scanning, cameraError, startScanning, stopScanning }
}
