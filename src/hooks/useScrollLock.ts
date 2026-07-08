import { useEffect } from 'react'

// Bloqueo de scroll robusto para iOS Safari: `overflow: hidden` en el body no
// alcanza ahí (Safari sigue permitiendo scroll por touchmove), lo que deja
// que la barra de direcciones colapse/expanda mientras el usuario interactúa
// con un modal — y con eso, un modal `fixed` puede recalcular su layout
// contra un viewport distinto al que tenía al montarse, empujando su
// contenido fuera de la pantalla visible. Fijar el body en su posición
// actual elimina esa fuente de scroll. Compartido por cualquier modal
// fullscreen del proyecto (antes vivía duplicado inline en ImageCropModal).
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const scrollY = window.scrollY
    const { body } = document
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    return () => {
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
