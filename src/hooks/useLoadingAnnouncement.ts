import { useEffect, useRef } from 'react'
import { useAnnouncer } from '../components/accessibility/LiveRegion'

// Anuncia "Carga completa" cuando `loading` pasa de true a false — sin esto,
// un lector de pantalla no tiene ninguna señal de que los skeletons
// terminaron y el contenido real ya está en el DOM. No anuncia nada en el
// primer render (evita un anuncio falso si el componente monta con
// loading=false directamente).
export function useLoadingAnnouncement(loading: boolean, doneMessage = 'Carga completa') {
  const { announce } = useAnnouncer()
  const wasLoading = useRef(loading)

  useEffect(() => {
    if (wasLoading.current && !loading) announce(doneMessage)
    wasLoading.current = loading
  }, [loading, doneMessage, announce])
}
