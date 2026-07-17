import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../Button'

type EmptyStateTone = 'default' | 'hero'

interface EmptyStateProps {
  /** Componente, no elemento ya renderizado — así el tamaño (w-8 h-8) queda
      fijo acá adentro en vez de que cada caller decida el suyo (antes
      MyInvitations.tsx pasaba w-12 h-12, 50% más grande que el resto sin
      motivo — hallazgo S9 de la auditoría). */
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  ctaText?: string
  to?: string
  onAction?: () => void
  /** 'default': ícono gris chico, para listas/tablas (admin, invitados).
      'hero': insignia de acento + caja oscura fija (ver Dashboard "Mis
      eventos") — es la primera pantalla que ve un usuario nuevo sin
      eventos, se mantiene más expresiva a propósito en vez de igualarla al
      resto (hallazgo S3 de la auditoría: comparte componente, no look). */
  tone?: EmptyStateTone
}

const HERO_BOX_STYLE = { background: 'rgba(30,20,40,.9)', border: '1px dashed rgba(74,50,92,.9)' }
const HERO_BADGE_STYLE = { background: 'rgba(255,20,100,.1)', border: '1px solid rgba(255,20,100,.2)' }

export function EmptyState({ icon: Icon, title, description, ctaText, to, onAction, tone = 'default' }: EmptyStateProps) {
  const hero = tone === 'hero'
  return (
    <div
      className="text-center rounded-2xl py-16 animate-fade-in"
      // Caja intencionalmente oscura en los dos modos para tone="hero" (no
      // sigue el toggle claro/oscuro): con opacidad .5 el texto blanco de
      // abajo quedaba con contraste insuficiente (~3:1) sobre fondo claro.
      style={hero ? HERO_BOX_STYLE : undefined}
    >
      <div
        className={hero ? 'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4' : 'flex justify-center mb-3 text-gray-400'}
        style={hero ? HERO_BADGE_STYLE : undefined}
      >
        <Icon className={hero ? 'w-6 h-6 text-primary' : 'w-8 h-8'} />
      </div>
      <p className={hero ? 'text-lg font-semibold text-white mb-1' : 'font-medium text-gray-900 dark:text-white mb-1'}>{title}</p>
      <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto leading-relaxed">{description}</p>
      {to && ctaText && (
        <Link
          to={to}
          className={hero
            ? 'inline-block bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:-translate-y-0.5 transition-all'
            : 'inline-block bg-primary text-white rounded-md px-5 py-2 text-sm font-medium hover:bg-primary-dark transition-colors active:scale-95'}
        >
          {ctaText}
        </Link>
      )}
      {onAction && ctaText && (
        <Button onClick={onAction} size="sm">
          {ctaText}
        </Button>
      )}
    </div>
  )
}
