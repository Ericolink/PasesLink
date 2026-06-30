import { IconAlertTriangle } from '../Icons'

interface Props {
  onRetry: () => void
  onManual: () => void
}

function getOSInstructions(): { title: string; steps: string[] } {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) {
    return {
      title: 'Cómo permitir la cámara en iOS',
      steps: [
        'Ve a Configuración del iPhone',
        'Desplázate hasta Safari (o tu navegador)',
        'Toca "Cámara" → selecciona "Permitir"',
        'Regresa aquí y toca "Reintentar"',
      ],
    }
  }
  if (/Android/.test(ua)) {
    return {
      title: 'Cómo permitir la cámara en Android',
      steps: [
        'Toca el ícono 🔒 en la barra de direcciones',
        'Selecciona "Permisos del sitio"',
        'Activa "Cámara" → "Permitir"',
        'Regresa aquí y toca "Reintentar"',
      ],
    }
  }
  return {
    title: 'Cómo permitir la cámara',
    steps: [
      'Busca el ícono de cámara bloqueada en la barra de URL',
      'Haz clic y selecciona "Permitir"',
      'Toca "Reintentar" abajo',
    ],
  }
}

export function CameraPermissionHandler({ onRetry, onManual }: Props) {
  const { title, steps } = getOSInstructions()

  return (
    <div className="flex flex-col items-start gap-3 px-5 w-full py-4">
      <div className="flex items-center gap-2 self-center">
        <IconAlertTriangle className="w-5 h-5 text-red-400" />
        <p className="text-red-400 text-sm font-semibold">No podemos acceder a tu cámara</p>
      </div>

      <div className="text-gray-400 text-xs space-y-1.5 self-stretch">
        <p className="font-medium text-gray-300">{title}:</p>
        {steps.map((step, i) => (
          <p key={i}>
            {i + 1}. {step}
          </p>
        ))}
      </div>

      <div className="flex gap-2 self-center mt-1">
        <button
          onClick={onRetry}
          className="min-h-12 bg-primary text-white rounded-xl px-6 py-3 text-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
        >
          Reintentar
        </button>
        <button
          onClick={onManual}
          className="min-h-12 bg-gray-800 text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-gray-700 active:scale-95 transition-all"
        >
          Ingresar código manual
        </button>
      </div>
    </div>
  )
}
