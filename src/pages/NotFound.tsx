import { Link } from 'react-router-dom'
import { IconHome, IconCalendar } from '../components/Icons'

export function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <p className="text-8xl font-black text-gray-200 dark:text-gray-800 select-none mb-6 leading-none">
        404
      </p>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Página no encontrada
      </h1>
      <p className="text-gray-500 mb-8 text-sm">
        La página que buscas no existe o fue movida a otra dirección.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 bg-primary text-white rounded-lg px-6 py-3 text-sm font-semibold hover:bg-primary-dark transition-colors active:scale-95"
      >
        <IconHome className="w-4 h-4" />
        Ir a Inicio
      </Link>
      <div className="mt-10 text-sm space-y-2 border-t border-gray-200 dark:border-gray-800 pt-8">
        <p className="text-gray-400">¿Quizás buscabas?</p>
        <div className="flex flex-col gap-1.5 mt-2">
          <Link to="/events/new" className="inline-flex items-center justify-center gap-1.5 text-primary hover:underline text-sm">
            <IconCalendar className="w-3.5 h-3.5" />
            Crear un evento
          </Link>
          <Link to="/my-invitations" className="text-primary hover:underline text-sm">
            Mis invitaciones
          </Link>
        </div>
      </div>
    </div>
  )
}
