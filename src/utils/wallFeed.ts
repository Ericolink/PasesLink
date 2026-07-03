import type { WallMessage } from '../types'
import type { PhotoData } from '../firebase/photos'

export type FeedItem =
  | { kind: 'message'; id: string; createdAt: number; message: WallMessage }
  | { kind: 'photo'; id: string; createdAt: number; photo: PhotoData }

// Mensajes y fotos son colecciones Firestore independientes (`wall` y
// `photos`), cada una con su propia ventana/límite ya existente — esta
// función solo intercala ambas listas ya cargadas por fecha, sin introducir
// un cursor de paginación unificado.
export function mergeWallFeed(messages: WallMessage[], photos: PhotoData[]): FeedItem[] {
  const items: FeedItem[] = [
    ...messages.map((m) => ({ kind: 'message' as const, id: m.id, createdAt: m.createdAt, message: m })),
    ...photos.map((p) => ({ kind: 'photo' as const, id: p.id, createdAt: p.createdAt, photo: p })),
  ]
  return items.sort((a, b) => {
    const aPinned = a.kind === 'message' && a.message.pinned
    const bPinned = b.kind === 'message' && b.message.pinned
    if (aPinned && !bPinned) return -1
    if (!aPinned && bPinned) return 1
    return b.createdAt - a.createdAt
  })
}
