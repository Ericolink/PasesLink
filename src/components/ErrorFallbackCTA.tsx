import { Link } from 'react-router-dom'
import { IconArrowLeft } from './Icons'

interface Props {
  message: string
  /** 'error' (rojo) para fallos reales; 'neutral' (gris) para "no encontrado"/
      "sin acceso", que no son errores del sistema. */
  tone?: 'error' | 'neutral'
}

// Único CTA de "volver al Dashboard" en pantallas sin resultado — antes
// copiado a mano 9 veces entre EventDetail/Reports/Scanner/GuestPass con 2
// radios y 2 mecanismos de hover distintos, y el glifo "←" en vez del ícono
// SVG que usa el resto de la app (hallazgos B3/H1/H5 de la auditoría).
export function ErrorFallbackCTA({ message, tone = 'neutral' }: Props) {
  return (
    <div className="text-center mt-16 px-4">
      <p className={tone === 'error' ? 'text-error' : 'text-gray-500'}>{message}</p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 mt-4 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
      >
        <IconArrowLeft className="w-4 h-4" />
        Volver al Dashboard
      </Link>
    </div>
  )
}
