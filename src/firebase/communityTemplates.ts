import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { withListenerReporting } from '../lib/sentry'
import type { CommunityTemplate, CommunityTemplateStatus, CommunityTemplateVars } from '../types'
import { CommunityTemplateVarsSchema, warnIfInvalidShape, CommunityTemplateSchema } from '../types/schemas'
import { requireMaxLength, requireNonEmpty } from '../utils/validation'

const NAME_MAX = 60
const DESCRIPTION_MAX = 500
const CATEGORY_MAX = 40
const LICENSE_MAX = 60

export interface SubmitCommunityTemplateInput {
  authorUid: string
  authorDisplayName: string
  name: string
  description: string
  category: string
  previewImageUrl?: string
  vars: CommunityTemplateVars
  license: string
  compatibility: string[]
  // true = "Enviar a revisión" (status inicial 'in_review'), false = "Guardar borrador".
  submit: boolean
}

// Valida vars de verdad (no solo diagnóstico, a diferencia del resto de
// schemas.ts) — content generado por un tercero, ver comentario en
// CommunityTemplateVarsSchema. Lanza con el primer error legible si no pasa.
function validateVars(vars: CommunityTemplateVars): CommunityTemplateVars {
  const result = CommunityTemplateVarsSchema.safeParse(vars)
  if (!result.success) {
    throw new Error('La plantilla tiene valores inválidos: ' + result.error.issues[0]?.message)
  }
  return result.data
}

export async function submitCommunityTemplate(input: SubmitCommunityTemplateInput): Promise<string> {
  const name = requireMaxLength(requireNonEmpty(input.name.trim(), 'El nombre'), NAME_MAX, 'El nombre')
  const description = requireMaxLength(input.description.trim(), DESCRIPTION_MAX, 'La descripción')
  const category = requireMaxLength(requireNonEmpty(input.category.trim(), 'La categoría'), CATEGORY_MAX, 'La categoría')
  const license = requireMaxLength(input.license.trim(), LICENSE_MAX, 'La licencia')
  const vars = validateVars(input.vars)

  const ref = await addDoc(collection(db, 'communityTemplates'), {
    name,
    authorUid: input.authorUid,
    authorDisplayName: input.authorDisplayName,
    description,
    category,
    previewImageUrl: input.previewImageUrl || '',
    vars,
    license,
    version: 1,
    compatibility: input.compatibility,
    status: (input.submit ? 'in_review' : 'draft') as CommunityTemplateStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(input.submit ? { submittedAt: serverTimestamp() } : {}),
  })
  return ref.id
}

export interface UpdateCommunityTemplateInput {
  name: string
  description: string
  category: string
  previewImageUrl?: string
  vars: CommunityTemplateVars
  license: string
  compatibility: string[]
  // true = reenviar a revisión (bumpea version), false = solo guardar borrador.
  submit: boolean
  previousVersion: number
}

// Solo aplicable mientras el doc está en 'draft'/'rejected' (ver
// firestore.rules, isValidCommunityTemplateAuthorUpdate) — el autor edita su
// propio envío y, si `submit` es true, lo reenvía a revisión.
export async function updateCommunityTemplate(templateId: string, input: UpdateCommunityTemplateInput): Promise<void> {
  const name = requireMaxLength(requireNonEmpty(input.name.trim(), 'El nombre'), NAME_MAX, 'El nombre')
  const description = requireMaxLength(input.description.trim(), DESCRIPTION_MAX, 'La descripción')
  const category = requireMaxLength(requireNonEmpty(input.category.trim(), 'La categoría'), CATEGORY_MAX, 'La categoría')
  const license = requireMaxLength(input.license.trim(), LICENSE_MAX, 'La licencia')
  const vars = validateVars(input.vars)

  await updateDoc(doc(db, 'communityTemplates', templateId), {
    name,
    description,
    category,
    previewImageUrl: input.previewImageUrl || '',
    vars,
    license,
    compatibility: input.compatibility,
    version: input.submit ? input.previousVersion + 1 : input.previousVersion,
    status: (input.submit ? 'in_review' : 'draft') as CommunityTemplateStatus,
    updatedAt: serverTimestamp(),
    ...(input.submit ? { submittedAt: serverTimestamp() } : {}),
  })
}

// Lectura puntual (no listener) — usada para precargar el formulario de
// edición (SubmitCommunityTemplate en modo edición), que solo necesita el
// dato una vez al montar, no mantenerlo sincronizado en vivo.
export async function getCommunityTemplate(templateId: string): Promise<CommunityTemplate | null> {
  const snap = await getDoc(doc(db, 'communityTemplates', templateId))
  return snap.exists() ? mapCommunityTemplate(snap.id, snap.data()) : null
}

export async function deleteCommunityTemplate(templateId: string): Promise<void> {
  await deleteDoc(doc(db, 'communityTemplates', templateId))
}

// Panel de admin — mismo criterio que subscribeToAllFeedback (sin limit(),
// bajo volumen esperado para un catálogo curado).
export function subscribeToAllCommunityTemplates(
  callback: (items: CommunityTemplate[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'communityTemplates'), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => mapCommunityTemplate(d.id, d.data()))),
    withListenerReporting('communityTemplates.all', onError),
  )
}

// "Mis envíos" (SubmitCommunityTemplate/MyCommunityTemplates) — where()
// acota la query al caso que permite firestore.rules (autor viendo lo suyo).
export function subscribeToMyCommunityTemplates(
  authorUid: string,
  callback: (items: CommunityTemplate[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'communityTemplates'), where('authorUid', '==', authorUid))
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => mapCommunityTemplate(d.id, d.data()))),
    withListenerReporting('communityTemplates.mine', onError),
  )
}

// TemplatePicker — solo se monta mientras el picker está abierto (nunca en
// el camino de renderizado del invitado, ver comentario en TemplatePicker.tsx),
// así que el costo de este listener es acotado a sesiones de organizador
// eligiendo plantilla, no por vista de invitado.
export function subscribeToApprovedCommunityTemplates(
  callback: (items: CommunityTemplate[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'communityTemplates'), where('status', '==', 'approved'), limit(100))
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map((d) => mapCommunityTemplate(d.id, d.data()))),
    withListenerReporting('communityTemplates.approved', onError),
  )
}

export interface ReviewCommunityTemplateInput {
  status: 'approved' | 'rejected' | 'archived'
  reviewerUid: string
  reviewNotes?: string
}

export async function reviewCommunityTemplate(templateId: string, input: ReviewCommunityTemplateInput): Promise<void> {
  await updateDoc(doc(db, 'communityTemplates', templateId), {
    status: input.status,
    reviewerUid: input.reviewerUid,
    reviewNotes: input.reviewNotes || '',
    updatedAt: serverTimestamp(),
    ...(input.status === 'approved' ? { publishedAt: serverTimestamp() } : {}),
  })
}

function mapCommunityTemplate(id: string, data: Record<string, unknown>): CommunityTemplate {
  const mapped: CommunityTemplate = {
    id,
    name: (data.name as string) || '',
    authorUid: (data.authorUid as string) || '',
    authorDisplayName: (data.authorDisplayName as string) || '',
    description: (data.description as string) || '',
    category: (data.category as string) || '',
    previewImageUrl: (data.previewImageUrl as string) || undefined,
    vars: data.vars as CommunityTemplate['vars'],
    license: (data.license as string) || '',
    version: (data.version as number) || 1,
    compatibility: (data.compatibility as string[]) || [],
    status: (data.status as CommunityTemplateStatus) || 'draft',
    reviewerUid: (data.reviewerUid as string) || undefined,
    reviewNotes: (data.reviewNotes as string) || undefined,
    createdAt: toMillis(data.createdAt),
    submittedAt: data.submittedAt ? toMillis(data.submittedAt) : undefined,
    publishedAt: data.publishedAt ? toMillis(data.publishedAt) : undefined,
    updatedAt: toMillis(data.updatedAt),
  }
  warnIfInvalidShape(CommunityTemplateSchema, 'CommunityTemplate', mapped)
  return mapped
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as Timestamp).toMillis()
  }
  return 0
}
