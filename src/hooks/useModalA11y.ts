import { useEffect, useRef } from 'react'
import { useScrollLock } from './useScrollLock'

// :not(:disabled) en los elementos que lo soportan: un botón/input/etc.
// deshabilitado en el borde del trap nunca puede recibir foco real del
// navegador, así que `document.activeElement` jamás coincide con ese
// "last"/"first" calculado — el Tab se escapa del modal en vez de ciclar
// (bug real, confirmado en ReportModal con su botón "Enviar" deshabilitado
// mientras el textarea está vacío).
const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

// `inert` en todo lo que NO contenga al diálogo — no se asume que el
// diálogo llega por portal a document.body (Modal.tsx/PhotoViewer.tsx sí;
// ExitConfirmDialog/ImageCropModal/ScanResultModal/ManualCodeEntryDialog
// viven inline dentro de #root). Buscar cuál hijo directo de <body> contiene
// al diálogo y dejar ESE fuera funciona para ambos casos por igual: si el
// diálogo está en un portal, ese hijo es su propio div de backdrop (y #root
// completo queda inert); si es inline, ese hijo ES #root (y no se toca a sí
// mismo). Guarda el `inert` previo de cada hermano para restaurarlo al
// cerrar — no simplemente `false` — así modales apilados (ej. un
// ImageCropModal abierto sobre el wizard) no le quitan el `inert` al fondo
// de más atrás cuando el de encima se cierra primero.
function applyBackgroundInert(dialog: HTMLElement | null): () => void {
  if (!dialog) return () => {}
  const siblings = Array.from(document.body.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && !el.contains(dialog),
  )
  const previousInert = siblings.map((el) => el.inert)
  siblings.forEach((el) => { el.inert = true })
  return () => {
    siblings.forEach((el, i) => { el.inert = previousInert[i] })
  }
}

// Accesibilidad compartida para los modales del proyecto: focus trap (Tab
// cíclico dentro del modal), Escape cierra, devolución de foco al elemento
// que lo tenía antes de abrir, y bloqueo de scroll del fondo (useScrollLock)
// mientras está abierto — así ningún modal nuevo puede "olvidarse" de sumar
// el scroll-lock por separado. Deliberadamente NO fuerza un foco inicial
// propio si el modal ya enfocó algo por su cuenta (ej. `autoFocus` en un
// input, o un ref específico como el botón de confirmar en ConfirmDialog) —
// solo entra como respaldo si nada dentro del modal tiene foco todavía, así
// no compite con comportamiento de foco ya intencional en cada modal.
//
// `open` puede pasarse como `true` fijo en modales que el padre monta/
// desmonta condicionalmente (en vez de mantenerlos montados con un flag
// `open` interno) — el montaje ya equivale a "abierto".
export function useModalA11y<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  // Callers casi siempre pasan `onClose` como arrow function inline, con
  // identidad nueva en cada render (ver GuestSignupPrompt). Si ese valor
  // entrara en las deps del efecto de abajo, cualquier re-render del padre
  // (p. ej. cada tecla en un input controlado dentro del modal) reiniciaría
  // el efecto: el cleanup devuelve el foco al elemento anterior y el setup
  // vuelve a enfocar el primer elemento del diálogo, robándole el foco al
  // input activo. Guardarlo en un ref evita que la IDENTIDAD de la función
  // dispare el efecto, sin perder acceso a la versión más reciente.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useScrollLock(open)

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    previousActiveElement.current = document.activeElement as HTMLElement | null
    const restoreBackgroundInert = applyBackgroundInert(dialog)

    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !dialog) return
      const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      restoreBackgroundInert()
      previousActiveElement.current?.focus()
    }
  }, [open])

  return dialogRef
}
