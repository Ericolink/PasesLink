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
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'

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
  }
}

export async function addPhoto(
  eventId: string,
  photo: Omit<PhotoData, 'id' | 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'events', eventId, 'photos'), {
    url: photo.url,
    authorName: photo.authorName,
    authorToken: photo.authorToken,
    caption: photo.caption || '',
    width: photo.width ?? null,
    height: photo.height ?? null,
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
  })
}

export async function deletePhoto(eventId: string, photoId: string): Promise<void> {
  await deleteDoc(doc(db, 'events', eventId, 'photos', photoId))
}
