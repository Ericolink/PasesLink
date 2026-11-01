// photos.authorToken es de lectura pública (firestore.rules, `photos`
// `allow read: if true`) — el qrToken de un invitado nunca puede guardarse
// ahí, porque da acceso a su pase (hallazgo N2 de la auditoría P0-4). En su
// lugar se guarda su SHA-256 en hex: sigue siendo estable por invitado (las
// fotos del mismo autor se agrupan igual en StoriesBar) pero no se puede
// revertir al token.
//
// scripts/lib/photoAuthorTokenBackfill.mjs calcula el mismo hash con
// node:crypto para migrar las fotos viejas — las dos implementaciones tienen
// que dar exactamente el mismo resultado (lo verifica
// src/firebase/__tests__/photoAuthorTokenBackfill.test.ts).
export async function hashGuestQrToken(qrToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(qrToken))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
