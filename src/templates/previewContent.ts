import type { TemplateId } from '../types'

interface PreviewSample {
  eventName: string
  date: string
  location: string
  guestName: string
}

// Datos ficticios usados por InvitationPreview solo como respaldo, campo
// por campo, cuando el formulario todavía no tiene ese dato — en cuanto el
// anfitrión escribe el nombre/fecha/ubicación reales, el preview los usa a
// ellos en su lugar.
export const PREVIEW_CONTENT: Record<TemplateId, PreviewSample> = {
  default: {
    eventName: 'Cumpleaños de Sofía',
    date: '14 oct 2026',
    location: 'Salón Jardín, Buenos Aires',
    guestName: 'María Gómez',
  },
  wedding: {
    eventName: 'Boda de Ana & Luis',
    date: '21 nov 2026',
    location: 'Hacienda Las Lomas',
    guestName: 'Carolina Fernández',
  },
  cowboy: {
    eventName: 'Fiesta Vaquera de Diego',
    date: '5 sep 2026',
    location: 'Rancho El Álamo',
    guestName: 'Rodrigo Paz',
  },
  graduation: {
    eventName: 'Graduación de Valentina',
    date: '30 nov 2026',
    location: 'Auditorio Central',
    guestName: 'Tomás Rivas',
  },
  formal: {
    eventName: 'Gala Anual de la Fundación',
    date: '10 dic 2026',
    location: 'Salón Imperial',
    guestName: 'Dr. Alberto Ruiz',
  },
  kids: {
    eventName: 'Cumpleaños de Tomás (5 años)',
    date: '2 ago 2026',
    location: 'Salón Pequeños Gigantes',
    guestName: 'Emma Castro',
  },
}

export const PREVIEW_WALL_MESSAGES = [
  { authorName: 'Lucía R.', text: '¡Qué ganas de que llegue el día! 🎉' },
  { authorName: 'Martín G.', text: '¿A qué hora hay que llegar?' },
]
