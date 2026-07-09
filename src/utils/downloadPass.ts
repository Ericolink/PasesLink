// Descarga el pase como PNG capturando el DOM real del boleto exportable
// (GuestPassTicket, no la invitación completa) en vez de redibujarlo a mano
// en un <canvas>. Así el pase descargado hereda automáticamente colores,
// tipografía, fondo, radios, sombras y ornamentos de la plantilla del
// evento (src/templates/registry.ts) sin lógica por plantilla: cualquier
// tema nuevo que se agregue ahí ya funciona acá sin tocar este archivo.
import { toPng } from 'html-to-image'

const PIXEL_RATIO = 3

// Nodos marcados con data-pass-exclude="true" (botones de Descargar/
// Compartir, no forman parte del diseño del pase) se omiten de la captura.
function isExcluded(node: unknown): boolean {
  return node instanceof HTMLElement && node.dataset.passExclude === 'true'
}

export async function downloadPassImage(node: HTMLElement, filename: string): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  let dataUrl: string
  try {
    dataUrl = await toPng(node, {
      pixelRatio: PIXEL_RATIO,
      cacheBust: true,
      filter: (n) => !isExcluded(n),
    })
  } catch (err) {
    // Red de seguridad ante cualquier <img> que taintee el canvas por CORS
    // (recurso servido desde un dominio externo sin cabeceras adecuadas) —
    // se reintenta sin imágenes para que el invitado igual se lleve su pase
    // en vez de un error duro.
    console.error('Error generando la imagen del pase, reintentando sin imágenes:', err)
    dataUrl = await toPng(node, {
      pixelRatio: PIXEL_RATIO,
      cacheBust: true,
      filter: (n) => !isExcluded(n) && !(n instanceof HTMLImageElement),
    })
  }

  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}
