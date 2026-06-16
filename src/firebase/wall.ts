import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
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
    likes: 0,
    replies: [],
    deleted: false,
    createdAt: serverTimestamp(),
  })
}

export async function likeWallMessage(eventId: string, messageId: string) {
  await updateDoc(doc(db, 'events', eventId, 'wall', messageId), {
    likes: increment(1),
  })
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

// Hard delete — only for admin cleanup
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
    likes: (data.likes as number) || 0,
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
