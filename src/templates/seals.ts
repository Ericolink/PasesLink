import type { TemplateId } from '../types'

// Qué temas tienen un sello propio — hoy solo Graduación. La geometría real
// vive en .invite-seal/.invite-seal-* dentro de templates.css, scoped por
// [data-template='x'], igual que el resto del sistema de temas. Agregar un
// tema con sello = una entrada más acá, nunca tocar ThemeSeal.tsx.
export const SEALS: Partial<Record<TemplateId, true>> = {
  graduation: true,
}
