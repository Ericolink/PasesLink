import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'
import { mapReply, reactToContent, replyToContent } from './interactions'
import type { ReactionType, WallReply } from '../types'

export interface PhotoData {
  id: string
  url: string
  authorName: string
  authorToken: string // qrToken del invitado que subió la foto
  caption?: string
  createdAt: number
  // Dimensiones del archivo subido (ver resizeImageForUpload) — permiten
  // reservar el aspect-ratio de la tarjeta/miniatura antes de que la imagen
  // cargue, evitando el salto de layout. Ausentes en fotos subidas antes de
  // este campo o si el navegador no pudo decodificar la imagen.
  width?: number
  height?: number
  pinned: boolean
  // Mismo modelo que WallMessage (ver types/index.ts) — reutilizado tal
  // cual para que una foto (y una "historia", que es la misma foto vista
  // agrupada, ver StoriesBar.tsx) tenga el mismo nivel de interacción que un
  // mensaje del muro. reactionCount/reactionCountsByType denormalizados
  // (auditoría F2/F11); la reacción individual vive en la subcolección
  // .../reactions/{token}, no en este documento. Fotos subidas antes de
  // estos campos no los tienen en Firestore — mapPhoto() completa `0`/`{}`.
  reactionCount: number
  reactionCountsByType: Partial<Record<ReactionType, number>>
  replies: WallReply[]
}

const MAX_PHOTOS_DISPLAYED = 60

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return Date.now()
}

function mapPhoto(id: string, data: Record<string, unknown>): PhotoData {
  return {
    id,
    url: data.url as string,
    authorName: (data.authorName as string) || '',
    authorToken: (data.authorToken as string) || '',
    caption: (data.caption as string) || undefined,
    createdAt: toMillis(data.createdAt),
    width: typeof data.width === 'number' ? data.width : undefined,
    height: typeof data.height === 'number' ? data.height : undefined,
    pinned: data.pinned === true,
    reactionCount: (data.reactionCount as number) || 0,
    reactionCountsByType: (data.reactionCountsByType as Partial<Record<ReactionType, number>>) || {},
    replies: ((data.replies as Record<string, unknown>[]) || []).map(mapReply),
  }
}

export async function addPhoto(
  eventId: string,
  photo: Omit<PhotoData, 'id' | 'createdAt' | 'pinned' | 'reactionCount' | 'reactionCountsByType' | 'replies'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'events', eventId, 'photos'), {
    url: photo.url,
    authorName: photo.authorName,
    authorToken: photo.authorToken,
    caption: photo.caption || '',
    width: photo.width ?? null,
    height: photo.height ?? null,
    reactionCount: 0,
    reactionCountsByType: {},
    replies: [],
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function fetchPhotos(eventId: string): Promise<PhotoData[]> {
  const q = query(
    collection(db, 'events', eventId, 'photos'),
    orderBy('createdAt', 'desc'),
    limit(MAX_PHOTOS_DISPLAYED),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapPhoto(d.id, d.data()))
}

// Carga histórica a pedido (NO en vivo): mismo patrón que getOlderWallMessages
// en wall.ts — el álbum solo mantiene en vivo la ventana reciente
// (MAX_PHOTOS_DISPLAYED); el resto se pagina por cursor con este helper,
// usado por el botón "Cargar fotos anteriores" en EventWall.tsx.
export async function getOlderPhotos(
  eventId: string,
  beforeCreatedAt: number,
  pageSize: number = MAX_PHOTOS_DISPLAYED,
): Promise<{ photos: PhotoData[]; hasMore: boolean }> {
  const q = query(
    collection(db, 'events', eventId, 'photos'),
    orderBy('createdAt', 'desc'),
    where('createdAt', '<', Timestamp.fromMillis(beforeCreatedAt)),
    limit(pageSize + 1),
  )
  const snap = await getDocs(q)
  const photos = snap.docs.slice(0, pageSize).map((d) => mapPhoto(d.id, d.data()))
  return { photos, hasMore: snap.docs.length > pageSize }
}

export function subscribeToPhotos(
  eventId: string,
  callback: (photos: PhotoData[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'events', eventId, 'photos'),
    orderBy('createdAt', 'desc'),
    limit(MAX_PHOTOS_DISPLAYED),
  )
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => mapPhoto(d.id, d.data())))
  }, withListenerReporting('photos'))
}

export async function deletePhoto(eventId: string, photoId: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId, 'photos', photoId))
}

// Destacar/quitar destacado de una foto — mismo concepto que pinWallMessage
// para mensajes, pero las fotos viven en su propia subcolección y antes no
// tenían este campo ni permiso de update en firestore.rules.
export async function pinPhoto(eventId: string, photoId: string, currentlyPinned: boolean): Promise<void> {
  await updateDoc(doc(db, 'events', eventId, 'photos', photoId), { pinned: !currentlyPinned })
}

// Reaccionar/responder a una foto (o a una "historia", que es la misma foto
// vista agrupada — ver StoriesBar.tsx) usa el mismo motor que los mensajes
// del muro, ver src/firebase/interactions.ts y reactToWallMessage/
// replyToWallMessage en wall.ts.
export async function reactToPhoto(
  eventId: string,
  photoId: string,
  token: string,
  name: string,
  reactionType: ReactionType | null,
  photoURL?: string,
) {
  await reactToContent(eventId, 'photos', photoId, token, name, reactionType, photoURL)
}

export async function replyToPhoto(
  eventId: string,
  photoId: string,
  text: string,
  authorName: string,
  authorToken: string,
  authorRole: 'owner' | 'guest' = 'guest',
  authorPhotoURL?: string,
): Promise<WallReply> {
  return replyToContent(eventId, 'photos', photoId, text, authorName, authorToken, authorRole, authorPhotoURL)
}
