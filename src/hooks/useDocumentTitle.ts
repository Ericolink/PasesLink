import { useEffect } from 'react'

// El título de pestaña era estático en toda la app — ninguna pantalla decía
// en qué sección estabas. Restaura el título anterior al desmontar, así una
// pantalla efímera (ej. un modal-página) no deja "pisado" el título de la
// que sigue.
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · PaseLink`
    return () => {
      document.title = previous
    }
  }, [title])
}
