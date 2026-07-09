// Motor genérico de reacciones/respuestas del muro, compartido por mensajes
// (events/{eventId}/wall) y fotos/historias (events/{eventId}/photos) — las
// "historias" no son una colección propia (ver StoriesBar.tsx: agrupan las
// mismas fotos por autor), así que reaccionar/responder a una historia ES
// reaccionar/responder al doc de `photos` subyacente, con estas mismas
// funciones. Extraído de lo que antes vivía hardcodeado a `wall` en
// wall.ts — mismo comportamiento, ahora parametrizado por colección para no
// duplicarlo en photos.ts.
import { doc, deleteField, FieldPath, updateDoc } from 'firebase/firestore'
import { db } from './config'
import {
  requireMaxLength,
  requireNonEmpty,
  WALL_NAME_MAX,
  WALL_PHOTO_URL_MAX,
  WALL_TEXT_MAX,
  WALL_TOKEN_MAX,
} from '../utils/validation'
import type { ReactionType, WallReaction, WallReply } from '../types'

export type InteractiveCollection = 'wall' | 'photos'

// Respuestas creadas antes de que `WallReply` tuviera campos de autor eran,
// por diseño previo, siempre del anfitrión (única identidad que podía
// responder) — se rellenan acá para que documentos viejos sigan mostrando
// "Anfitrión" sin que la UI necesite un caso especial para datos legados.
export function mapReply(data: Record<string, unknown>): WallReply {
  return {
    id: data.id as string,
    text: data.text as string,
    authorName: (data.authorName as string) || '',
    authorToken: (data.authorToken as string) || '',
    authorRole: (data.authorRole as 'owner' | 'guest') || 'owner',
    authorPhotoURL: (data.authorPhotoURL as string) || undefined,
    createdAt: data.createdAt as number,
  }
}

// Un solo campo (`reactions.<token>`) reemplaza el par likedBy/dislikedBy:
// como es un map keyed por token, cada reactor tiene a lo sumo una entrada
// (elegir otra reacción pisa la anterior, nunca hay que limpiar un array
// aparte) y agregar un tipo de reacción nuevo no toca este archivo.
// Se usa FieldPath en vez de la forma `{ [`reactions.${token}`]: ... }`
// porque un token puede traer '.' (ej. viene de un nombre de invitado
// escrito a mano) — con FieldPath ese token viaja como un único segmento
// de ruta, nunca se interpreta como un map anidado.
export async function reactToContent(
  eventId: string,
  collectionName: InteractiveCollection,
  docId: string,
  token: string,
  name: string,
  reactionType: ReactionType | null,
) {
  const ref = doc(db, 'events', eventId, collectionName, docId)
  const path = new FieldPath('reactions', token)
  await updateDoc(ref, path, reactionType ? ({ type: reactionType, name } satisfies WallReaction) : deleteField())
}

// Devuelve la respuesta creada (no solo `void`) para que un llamador sin
// listener en vivo (ver handleReplyPhoto en WallSection.tsx) pueda
// reflejarla de inmediato en su estado local sin reconstruir a mano la
// misma forma ni inventar un id que no coincida con el que quedó escrito.
export async function replyToContent(
  eventId: string,
  collectionName: InteractiveCollection,
  docId: string,
  text: string,
  currentReplies: WallReply[],
  authorName: string,
  authorToken: string,
  authorRole: 'owner' | 'guest' = 'guest',
  authorPhotoURL?: string,
): Promise<WallReply> {
  const trimmedText = requireMaxLength(requireNonEmpty(text, 'La respuesta'), WALL_TEXT_MAX, 'La respuesta')
  const trimmedName = requireMaxLength(requireNonEmpty(authorName, 'El nombre'), WALL_NAME_MAX, 'El nombre')
  requireMaxLength(authorToken, WALL_TOKEN_MAX, 'El identificador de autor')
  if (authorPhotoURL) requireMaxLength(authorPhotoURL, WALL_PHOTO_URL_MAX, 'La URL de la foto')

  const newReply: WallReply = {
    id: crypto.randomUUID(),
    text: trimmedText,
    authorName: trimmedName,
    authorToken,
    authorRole,
    createdAt: Date.now(),
    ...(authorPhotoURL ? { authorPhotoURL } : {}),
  }
  await updateDoc(doc(db, 'events', eventId, collectionName, docId), {
    replies: [...currentReplies, newReply],
  })
  return newReply
}
