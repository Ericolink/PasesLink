import { useState } from 'react'
import { blurPlaceholderUrl } from '../utils/cloudinary'

interface Props {
  src: string
  alt: string
  className?: string
  imgClassName?: string
  width?: number
  height?: number
  // Relación de aspecto a reservar cuando `width`/`height` no vienen (fotos
  // subidas antes de que ese campo existiera, o que el navegador no pudo
  // decodificar — ver PhotoData). Sin esto, el contenedor queda sin alto
  // definido hasta que la imagen carga: sus <img> hijos con h-full no tienen
  // una altura porcentual válida (el padre no tiene una altura propia) y el
  // salto de layout ocurre igual aunque el resto del componente ya reserve
  // espacio cuando sí conoce las dimensiones. No tiene efecto cuando el
  // contenedor ya tiene alto explícito por otra vía (p.ej. w-16 h-16 fijos).
  fallbackAspectRatio?: number
  loading?: 'lazy' | 'eager'
  onClick?: () => void
}

// <img> con placeholder borroso (blur-up) mientras carga la versión real, y
// alto reservado por aspect-ratio cuando se conocen las dimensiones — evita
// tanto el "flash" de un recuadro vacío como el salto de layout al terminar
// de cargar, que es lo que hacía sentir lenta la carga de fotos en el muro
// aunque la imagen en sí ya viniera optimizada.
export function ProgressiveImage({ src, alt, className = '', imgClassName = '', width, height, fallbackAspectRatio, loading = 'lazy', onClick }: Props) {
  const [loaded, setLoaded] = useState(false)
  const aspectRatio = width && height ? width / height : fallbackAspectRatio

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={aspectRatio ? { aspectRatio: String(aspectRatio) } : undefined}
      onClick={onClick}
    >
      <img
        src={blurPlaceholderUrl(src)}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 w-full h-full object-cover scale-110 transition-opacity duration-300 ${loaded ? 'opacity-0' : 'opacity-100'}`}
      />
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`relative w-full h-full transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
      />
    </div>
  )
}
