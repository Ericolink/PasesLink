import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import {
  requireMaxLength,
  requireNonEmpty,
  WALL_NAME_MAX,
  WALL_PHOTO_URL_MAX,
  WALL_TEXT_MAX,
  WALL_TOKEN_MAX,
  WALL_TYPES,
} from '../utils/validation'
import type { ReactionType, WallMessage, WallMessageType, WallReaction, WallReply } from '../types'
import { WallMessageSchema, warnIfInvalidShape } from '../types/schemas'

export const DEFAULT_WALL_LIVE_LIMIT = 50

// El muro puede acumular cientos de mensajes en un evento largo. En vez de un
// listener sin límite (descarga todo el historial y reenvía un delta a cada
// dispositivo conectado por cada like/dislike/post), se mantiene en vivo solo
// una ventana reciente (`liveLimit`) más los mensajes destacados (`pinned`,
// que pueden ser viejos y deben seguir visibles arriba). El historial más
// antiguo se carga aparte, a pedido, con `getOlderWallMessages` — ver ahí.
//
// TODO Fase 3+: esta función sigue siendo 2 listeners en tiempo real
// (`recent` + `pinned`) por cada llamador. GuestPass.tsx (vía WallSection) la
// monta en una página 100% pública sin login — cada invitado con su pase
// abierto paga esos 2 listeners. En un evento concurrido esto puede agotar
// la cuota gratuita de Firestore rápido. Posible solución: polling/refresh
// manual en el pase individual, o tiempo real solo para EventWall.
export function subscribeToWall(
  eventId: string,
  callback: (messages: WallMessage[]) => void,
  onError?: (error: Error) => void,
  liveLimit: number = DEFAULT_WALL_LIVE_LIMIT,
): Unsubscribe {
  let recent: WallMessage[] | null = null
  let pinned: WallMessage[] | null = null

  function emitIfReady() {
    if (recent === null || pinned === null) return
    const byId = new Map<string, WallMessage>()
    for (const m of recent) byId.set(m.id, m)
    for (const m of pinned) byId.set(m.id, m)
    callback(Array.from(byId.values()).filter((m) => !m.deleted))
  }

  const recentQuery = query(
    collection(db, 'events', eventId, 'wall'),
    orderBy('createdAt', 'desc'),
    limit(liveLimit),
  )
  const unsubRecent = onSnapshot(
    recentQuery,
    (snap) => {
      recent = snap.docs.map((d) => mapMessage(d.id, d.data()))
      emitIfReady()
    },
    onError,
  )

  const pinnedQuery = query(
    collection(db, 'events', eventId, 'wall'),
    where('pinned', '==', true),
  )
  const unsubPinned = onSnapshot(
    pinnedQuery,
    (snap) => {
      pinned = snap.docs.map((d) => mapMessage(d.id, d.data()))
      emitIfReady()
    },
    onError,
  )

  return () => {
    unsubRecent()
    unsubPinned()
  }
}

// Variante sin listener: una sola lectura (recent + pinned, mismo criterio
// que subscribeToWall) en vez de una suscripción permanente. Pensada para
// widgets embebidos en páginas públicas de alto tráfico (WallSection en
// GuestPass/EventJoin) donde un listener en vivo por visitante es el patrón
// de mayor riesgo de costo del proyecto (ver TODO más arriba). El llamador
// decide cuándo volver a pedir datos (ej. al montar, o con un botón
// "Actualizar"), en vez de recibir actualizaciones automáticas.
export async function fetchWallMessages(
  eventId: string,
  liveLimit: number = DEFAULT_WALL_LIVE_LIMIT,
): Promise<WallMessage[]> {
  const recentQuery = query(
    collection(db, 'events', eventId, 'wall'),
    orderBy('createdAt', 'desc'),
    limit(liveLimit),
  )
  const pinnedQuery = query(
    collection(db, 'events', eventId, 'wall'),
    where('pinned', '==', true),
  )
  const [recentSnap, pinnedSnap] = await Promise.all([getDocs(recentQuery), getDocs(pinnedQuery)])

  const byId = new Map<string, WallMessage>()
  for (const d of recentSnap.docs) byId.set(d.id, mapMessage(d.id, d.data()))
  for (const d of pinnedSnap.docs) byId.set(d.id, mapMessage(d.id, d.data()))
  return Array.from(byId.values()).filter((m) => !m.deleted)
}

// Carga histórica a pedido (NO en vivo): una sola lectura por página, usada
// por el botón "Cargar mensajes anteriores". `beforeCreatedAt` es el
// `createdAt` (millis) del mensaje más antiguo ya cargado en pantalla.
export async function getOlderWallMessages(
  eventId: string,
  beforeCreatedAt: number,
  pageSize: number = DEFAULT_WALL_LIVE_LIMIT,
): Promise<{ messages: WallMessage[]; hasMore: boolean }> {
  const q = query(
    collection(db, 'events', eventId, 'wall'),
    orderBy('createdAt', 'desc'),
    where('createdAt', '<', Timestamp.fromMillis(beforeCreatedAt)),
    limit(pageSize + 1),
  )
  const snap = await getDocs(q)
  const messages = snap.docs
    .slice(0, pageSize)
    .map((d) => mapMessage(d.id, d.data()))
    .filter((m) => !m.deleted)
  return { messages, hasMore: snap.docs.length > pageSize }
}

// Capa de aplicación: no confiar en que la UI ya validó. Cualquier llamador
// (actual o futuro) pasa por estas mismas validaciones antes de llegar a
// Firestore. Los límites están duplicados en firestore.rules — esa es la
// barrera real ante un cliente que la ignore por completo.
export async function postWallMessage(
  eventId: string,
  text: string,
  type: WallMessageType,
  authorName: string,
  authorToken: string,
  authorRole: 'owner' | 'guest' = 'guest',
  authorPhotoURL?: string,
) {
  const trimmedText = requireMaxLength(requireNonEmpty(text, 'El mensaje'), WALL_TEXT_MAX, 'El mensaje')
  if (!WALL_TYPES.includes(type)) {
    throw new Error('Tipo de mensaje no válido.')
  }
  const trimmedName = requireMaxLength(requireNonEmpty(authorName, 'El nombre'), WALL_NAME_MAX, 'El nombre')
  requireMaxLength(authorToken, WALL_TOKEN_MAX, 'El identificador de autor')
  if (authorPhotoURL) requireMaxLength(authorPhotoURL, WALL_PHOTO_URL_MAX, 'La URL de la foto')

  await addDoc(collection(db, 'events', eventId, 'wall'), {
    text: trimmedText,
    type,
    authorName: trimmedName,
    authorToken,
    authorRole,
    authorPhotoURL: authorPhotoURL || null,
    reactions: {},
    replies: [],
    deleted: false,
    pinned: false,
    createdAt: serverTimestamp(),
  })
}

export async function pinWallMessage(
  eventId: string,
  messageId: string,
  currentlyPinned: boolean,
) {
  await updateDoc(doc(db, 'events', eventId, 'wall', messageId), {
    pinned: !currentlyPinned,
  })
}

// Un solo campo (`reactions.<token>`) reemplaza el par likedBy/dislikedBy:
// como es un map keyed por token, cada reactor tiene a lo sumo una entrada
// (elegir otra reacción pisa la anterior, nunca hay que limpiar un array
// aparte) y agregar un tipo de reacción nuevo no toca este archivo.
// Se usa FieldPath en vez de la forma `{ [`reactions.${token}`]: ... }`
// porque un token puede traer '.' (ej. viene de un nombre de invitado
// escrito a mano) — con FieldPath ese token viaja como un único segmento
// de ruta, nunca se interpreta como un map anidado.
export async function reactToWallMessage(
  eventId: string,
  messageId: string,
  token: string,
  name: string,
  reactionType: ReactionType | null,
) {
  const ref = doc(db, 'events', eventId, 'wall', messageId)
  const path = new FieldPath('reactions', token)
  await updateDoc(ref, path, reactionType ? ({ type: reactionType, name } satisfies WallReaction) : deleteField())
}

export async function replyToWallMessage(
  eventId: string,
  messageId: string,
  text: string,
  currentReplies: WallReply[],
) {
  const trimmedText = requireMaxLength(requireNonEmpty(text, 'La respuesta'), WALL_TEXT_MAX, 'La respuesta')
  const newReply: WallReply = {
    id: crypto.randomUUID(),
    text: trimmedText,
    createdAt: Date.now(),
  }
  await updateDoc(doc(db, 'events', eventId, 'wall', messageId), {
    replies: [...currentReplies, newReply],
  })
}

export async function deleteWallMessage(eventId: string, messageId: string) {
  await updateDoc(doc(db, 'events', eventId, 'wall', messageId), {
    deleted: true,
  })
}

export async function hardDeleteWallMessage(eventId: string, messageId: string) {
  await deleteDoc(doc(db, 'events', eventId, 'wall', messageId))
}

function mapMessage(id: string, data: Record<string, unknown>): WallMessage {
  const message: WallMessage = {
    id,
    text: data.text as string,
    type: (data.type as WallMessageType) || 'comment',
    authorName: data.authorName as string,
    authorToken: data.authorToken as string,
    authorRole: (data.authorRole as 'owner' | 'guest') || 'guest',
    authorPhotoURL: (data.authorPhotoURL as string) || undefined,
    reactions: (data.reactions as Record<string, WallReaction>) || {},
    replies: (data.replies as WallReply[]) || [],
    deleted: (data.deleted as boolean) || false,
    pinned: (data.pinned as boolean) || false,
    createdAt: toMillis(data.createdAt),
  }
  warnIfInvalidShape(WallMessageSchema, 'WallMessage', message)
  return message
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return Date.now()
}
