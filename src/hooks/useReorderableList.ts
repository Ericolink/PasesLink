interface ReorderableListActions<T> {
  add: (item: T) => void
  update: (id: string, patch: Partial<T>) => void
  remove: (id: string) => void
  moveUp: (id: string) => void
  moveDown: (id: string) => void
  canAdd: boolean
}

// Primitivo compartido de add/editar/quitar/reordenar para un array de
// objetos con `id` — usado por el editor de opciones de un campo `select`
// (CustomFieldOptionsEditor), el editor de FAQ (FaqEditor) y el de opciones
// de transporte (TransportEditor). Sin librería de drag-and-drop (ninguna
// está instalada en el proyecto): reordenar es moveUp/moveDown, mismo peso
// visual que el botón "×" que ya usan CustomFieldsBuilder/TimelineEditor.
export function useReorderableList<T extends { id: string }>(
  items: T[],
  onChange: (items: T[]) => void,
  options?: { max?: number },
): ReorderableListActions<T> {
  function add(item: T) {
    if (options?.max && items.length >= options.max) return
    onChange([...items, item])
  }

  function update(id: string, patch: Partial<T>) {
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }

  function remove(id: string) {
    onChange(items.filter((it) => it.id !== id))
  }

  function moveUp(id: string) {
    const index = items.findIndex((it) => it.id === id)
    if (index <= 0) return
    const next = [...items]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange(next)
  }

  function moveDown(id: string) {
    const index = items.findIndex((it) => it.id === id)
    if (index === -1 || index >= items.length - 1) return
    const next = [...items]
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    onChange(next)
  }

  const canAdd = !options?.max || items.length < options.max

  return { add, update, remove, moveUp, moveDown, canAdd }
}
