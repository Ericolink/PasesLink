// Mensaje "sin resultados" liviano para dentro de una tabla filtrada (a
// diferencia de EmptyState, pensado para la colección vacía de entrada, no
// para un filtro/búsqueda sin coincidencias).
export function EmptyRow({ message }: { message: string }) {
  return <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">{message}</p>
}
