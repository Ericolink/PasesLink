// Resuelve quién aparece como "invitador" en la preview de un enlace de
// auto-registro (?ref=<uid> en la URL, ver eventJoinMeta.ts) sin confiar
// nunca en un nombre mandado por el cliente — solo en un uid, verificado
// contra los permisos reales del evento y resuelto a un nombre real desde
// Firestore. `shareInviteLink` es el mismo permiso que ya gatea el botón
// "Compartir evento" en EventDetail.tsx (perms.shareInviteLink) — reusa
// hasPermission (functions/src/lib/permissions.ts) en vez de inventar una
// noción de "miembro del evento" aparte: si alguien no puede ver el botón
// que genera este link, tampoco debería poder aparecer como quien lo generó.
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import { hasPermission } from '../lib/permissions.js'

export interface LinkCreator {
  displayName: string
  isOwner: boolean
}

// Ningún uid real de Firebase Auth contiene "/", y todos son razonablemente
// cortos — un ?ref= que no cumpla esto no puede ser un uid legítimo, se
// descarta antes de tocar Firestore (evita que un path raro llegue a
// doc(refUid) con formato inesperado).
function isPlausibleUid(value: string): boolean {
  return value.length > 0 && value.length <= 128 && !value.includes('/')
}

async function readDisplayName(db: Firestore, uid: string): Promise<string | null> {
  const snap = await db.collection('users').doc(uid).get()
  if (!snap.exists) return null
  const data = snap.data() as DocumentData
  const displayName = (data.displayName as string | undefined)?.trim()
  const email = (data.email as string | undefined)?.trim()
  return displayName || email || null
}

// Nunca deja el template de metadata sin nombre — ni el organizador tiene
// perfil completo en casos muy viejos/raros.
const GENERIC_ORGANIZER_LABEL = 'El organizador'

export async function resolveLinkCreator(
  db: Firestore,
  event: DocumentData,
  refUid: string | null,
): Promise<LinkCreator> {
  const ownerId = event.ownerId as string

  if (refUid && isPlausibleUid(refUid) && hasPermission(event, refUid, 'shareInviteLink')) {
    const name = await readDisplayName(db, refUid)
    if (name) return { displayName: name, isOwner: refUid === ownerId }
  }

  const ownerName = await readDisplayName(db, ownerId)
  return { displayName: ownerName ?? GENERIC_ORGANIZER_LABEL, isOwner: true }
}
