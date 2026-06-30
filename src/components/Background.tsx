export function Background() {
  return (
    <>
      {/* Orbs animados: z-index -1 → pintados debajo del flujo normal */}
      <div className="app-bg" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
      </div>

      {/* Grano sutil: la niebla ligera del exterior del evento */}
      <div className="app-grain" aria-hidden="true" />

      {/* Vignette: oscurece bordes sin afectar el contenido */}
      <div className="app-vignette" aria-hidden="true" />
    </>
  )
}
