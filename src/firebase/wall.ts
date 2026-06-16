import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from './config'
import type { WallMessage, WallMessageType, WallReply } from '../types'

export function subscribeToWall(
  eventId: string,
  callback: (messages: WallMessage[]) => void,
) {
  const q = query(
    collection(db, 'events', eventId, 'wall'),
    orderBy('createdAt', 'desc'),
  )
  return onSnapshot(q, (snap) => {
    const messages = snap.docs
      .map((d) => mapMessage(d.id, d.data()))
      .filter((m) => !m.deleted)
    callback(messages)
  })
}

export async function postWallMessage(
  eventId: string,
  text: string,
  type: WallMessageType,
  authorName: string,
  authorToken: string,
) {
  await addDoc(collection(db, 'events', eventId, 'wall'), {
    text: text.trim(),
    type,
    authorName,
    authorToken,
    likedBy: [],
    dislikedBy: [],
    replies: [],
    deleted: false,
    createdAt: serverTimestamp(),
  })
}

export async function likeWallMessage(
  eventId: string,
  messageId: string,
  token: string,
  currentlyLiked: boolean,
) {
  await updateDoc(doc(db, 'events', eventId, 'wall', messageId),
    currentlyLiked
      ? { likedBy: arrayRemove(token) }
      : { likedBy: arrayUnion(token), dislikedBy: arrayRemove(token) },
  )
}

export async function dislikeWallMessage(
  eventId: string,
  messageId: string,
  token: string,
  currentlyDisliked: boolean,
) {
  await updateDoc(doc(db, 'events', eventId, 'wall', messageId),
    currentlyDisliked
      ? { dislikedBy: arrayRemove(token) }
      : { dislikedBy: arrayUnion(token), likedBy: arrayRemove(token) },
  )
}

export async function replyToWallMessage(
  eventId: string,
  messageId: string,
  text: string,
  currentReplies: WallReply[],
) {
  const newReply: WallReply = {
    id: crypto.randomUUID(),
    text: text.trim(),
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
  return {
    id,
    text: data.text as string,
    type: (data.type as WallMessageType) || 'comment',
    authorName: data.authorName as string,
    authorToken: data.authorToken as string,
    likedBy: (data.likedBy as string[]) || [],
    dislikedBy: (data.dislikedBy as string[]) || [],
    replies: (data.replies as WallReply[]) || [],
    deleted: (data.deleted as boolean) || false,
    createdAt: toMillis(data.createdAt),
  }
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return Date.now()
}
