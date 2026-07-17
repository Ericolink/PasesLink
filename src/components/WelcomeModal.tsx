import { useEffect } from 'react'
import confetti from 'canvas-confetti'
import { Button } from './Button'
import { Modal } from './Modal'
import { DialogFooter } from './DialogFooter'
import { Logo } from './Logo'
import {
  IconBarChart2,
  IconCalendar,
  IconCamera,
  IconSparkles,
  IconTicket,
  IconUserPlus,
} from './Icons'

interface ListItem {
  icon: React.ReactNode
  title: string
  description: string
}

const WELCOME_ITEMS: ListItem[] = [
  {
    icon: <IconCalendar className="w-5 h-5" />,
    title: 'Crea tu primer evento',
    description: 'Elige una plantilla de invitación y personalízala a tu gusto.',
  },
  {
    icon: <IconUserPlus className="w-5 h-5" />,
    title: 'Invita a tus contactos',
    description: 'Comparte el enlace o el QR de tu evento por WhatsApp o redes.',
  },
  {
    icon: <IconTicket className="w-5 h-5" />,
    title: 'Controla el acceso',
    description: 'Escanea el pase de cada invitado en la entrada, sin listas de papel.',
  },
  {
    icon: <IconBarChart2 className="w-5 h-5" />,
    title: 'Revisa tus reportes',
    description: 'Sigue confirmaciones y asistencia en tiempo real.',
  },
  {
    icon: <IconCamera className="w-5 h-5" />,
    title: 'Muro del evento',
    description: 'Tus invitados pueden dejar fotos y mensajes durante la fiesta.',
  },
]

// Se actualiza junto con NOVEDADES_VERSION en utils/onboarding.ts.
const NOVEDADES_ITEMS: ListItem[] = [
  {
    icon: <IconSparkles className="w-5 h-5" />,
    title: 'Instala PaseLink en tu celular',
    description: 'Ahora es una app instalable: agrégala a tu pantalla de inicio y ábrela sin navegador.',
  },
  {
    icon: <IconTicket className="w-5 h-5" />,
    title: 'Buzón de quejas y comentarios',
    description: 'Cuéntanos qué mejorarías desde el nuevo formulario de feedback.',
  },
  {
    icon: <IconBarChart2 className="w-5 h-5" />,
    title: 'Mejoras de rendimiento',
    description: 'La app carga más rápido en todas las páginas.',
  },
]

interface Props {
  open: boolean
  variant: 'welcome' | 'novedades'
  firstName?: string
  onClose: () => void
}

export function WelcomeModal({ open, variant, firstName, onClose }: Props) {
  const isWelcome = variant === 'welcome'
  const items = isWelcome ? WELCOME_ITEMS : NOVEDADES_ITEMS

  useEffect(() => {
    if (open && isWelcome) {
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 } })
    }
  }, [open, isWelcome])

  return (
    <Modal open={open} onClose={onClose} label={isWelcome ? 'Bienvenido a PaseLink' : 'Novedades de PaseLink'}>
      <div className="overflow-y-auto">
        <div className="flex flex-col items-center px-6 pt-7 pb-2 text-center">
          <Logo className="h-8 mb-4" />
          {isWelcome ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                ¡Bienvenido a PaseLink{firstName ? `, ${firstName}` : ''}!
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Esto es lo que puedes hacer desde aquí:
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Novedades en PaseLink
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Esto es lo nuevo desde tu última visita:
              </p>
            </>
          )}
        </div>

        <ul className="px-6 py-4 space-y-3">
          {items.map((item) => (
            <li key={item.title} className="flex items-start gap-3">
              <span className="shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                {item.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <DialogFooter>
        <Button variant="primary" onClick={onClose} className="w-full">
          {isWelcome ? 'Empezar' : 'Entendido'}
        </Button>
      </DialogFooter>
    </Modal>
  )
}
