// className controla la altura (y cualquier margen extra) — el default cubre
// el tamaño de siempre; los llamadores que necesitan otro tamaño pasan su
// propia clase de altura, que reemplaza el default en vez de competir con él
// (antes "h-9" se concatenaba siempre antes del className del llamador, y
// cuál de las dos clases de altura ganaba dependía del orden en que Tailwind
// las generaba, no de la intención del código).
export function Logo({ className = 'h-9' }: { className?: string }) {
  return (
    <img
      src="/Logo.png"
      alt="PaseLink"
      className={`w-auto logo-glow ${className}`}
    />
  )
}
