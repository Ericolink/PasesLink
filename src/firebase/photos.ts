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
  updateDoc,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'
import { mapReply, reactToContent, replyToContent } from './interactions'
import type { ReactionType, WallReaction, WallReply } from '../types'

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
  // mensaje del muro. Fotos subidas antes de este campo no lo tienen en
  // Firestore — mapPhoto() lo completa acá con `{}`/`[]`.
  reactions: Record<string, WallReaction>
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
    reactions: (data.reactions as Record<string, WallReaction>) || {},
    replies: ((data.replies as Record<string, unknown>[]) || []).map(mapReply),
  }
}

export async function addPhoto(
  eventId: string,
  photo: Omit<PhotoData, 'id' | 'createdAt' | 'pinned' | 'reactions' | 'replies'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'events', eventId, 'photos'), {
    url: photo.url,
    authorName: photo.authorName,
    authorToken: photo.authorToken,
    caption: photo.caption || '',
    width: photo.width ?? null,
    height: photo.height ?? null,
    reactions: {},
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
  currentReplies: WallReply[],
  authorName: string,
  authorToken: string,
  authorRole: 'owner' | 'guest' = 'guest',
  authorPhotoURL?: string,
): Promise<WallReply> {
  return replyToContent(eventId, 'photos', photoId, text, currentReplies, authorName, authorToken, authorRole, authorPhotoURL)
}
