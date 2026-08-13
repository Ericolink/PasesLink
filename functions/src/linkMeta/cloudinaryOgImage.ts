// Puerto standalone de optimizedImageUrl (src/utils/cloudinary.ts) — no se
// importa porque functions/src/ es standalone (ver comentario en
// functions/src/index.ts: "no importa nada de src/"). A diferencia de esa
// versión (que solo ajusta el ancho y sirve para cualquier imagen de la
// app), esta fuerza un recorte 1200x630 (proporción 1.91:1, el estándar de
// Open Graph) porque las portadas de evento no tienen una proporción fija.
export function ogCropUrl(url: string): string | null {
  if (!url) return null
  const marker = '/upload/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const insertAt = idx + marker.length
  return `${url.slice(0, insertAt)}c_fill,g_auto,w_1200,h_630,q_auto,f_auto/${url.slice(insertAt)}`
}
