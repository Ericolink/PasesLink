// Lógica pura (sin React) para el selector "¿Cuál de estas personas eres
// tú?" (ver CompanionClaimRoster.tsx) — separada del componente para poder
// testearla sin montar nada y para que GuestPass.tsx (plantillas clásicas) y
// HousePartyPassLayout/InvitationGuestInfo.tsx (plantilla rediseñada)
// compartan exactamente la misma derivación.
import type { GuestData } from '../types'

export interface ClaimableRosterRow {
  // 0 = invitado principal (mismo slot que GuestData.guestUid). 1..N =
  // companions[i-1] (mismo esquema que presentIndices/companionClaims).
  index: number
  fullName: string
  claimedByUid: string | null
}

type RosterGuest = Pick<GuestData, 'isGroup' | 'groupLabel' | 'name' | 'lastName' | 'companions' | 'guestUid' | 'companionClaims'>

function fullNameOf(name?: string, lastName?: string): string {
  return [name, lastName].filter(Boolean).join(' ').trim()
}

// El índice 0 (name/lastName del documento) solo es una PERSONA reclamable
// cuando: (a) es un invitado individual normal (siempre lo fue, con o sin
// acompañantes), o (b) es un grupo creado con el formulario rediseñado, que
// se distingue por tener `groupLabel` — ahí name/lastName son los del
// primer integrante real. Un grupo LEGACY (isGroup sin groupLabel) tiene en
// `name` un rótulo del grupo entero (ej. "Familia Muñoz"), no una persona:
// no se ofrece para reclamar. Ver el comentario de GuestData.groupLabel.
function isPrincipalClaimable(guest: RosterGuest): boolean {
  return !guest.isGroup || !!guest.groupLabel
}

// Solo se listan personas con nombre real — un acompañante legacy cargado
// como "familia o grupo" antes de este rediseño no tiene nombre propio (ver
// GuestAddForm.tsx), y no hay nada que un lector pueda "reconocerse" ahí.
export function getClaimableRoster(guest: RosterGuest): ClaimableRosterRow[] {
  const rows: ClaimableRosterRow[] = []
  if (isPrincipalClaimable(guest)) {
    const fullName = fullNameOf(guest.name, guest.lastName)
    if (fullName) rows.push({ index: 0, fullName, claimedByUid: guest.guestUid || null })
  }
  guest.companions.forEach((companion, i) => {
    const fullName = fullNameOf(companion.name, companion.lastName)
    if (!fullName) return
    const index = i + 1
    rows.push({ index, fullName, claimedByUid: guest.companionClaims?.[String(index)] || null })
  })
  return rows
}

// Frase para el visor ACTUAL de este pase, según qué persona ya reclamó (si
// reclamó alguna) — null si no tiene sesión o todavía no reclamó a nadie de
// esta invitación (el selector de abajo sigue disponible en ese caso).
export function describeViewerClaimRole(guest: RosterGuest, currentUid: string | null): string | null {
  if (!currentUid) return null
  if (guest.guestUid === currentUid && isPrincipalClaimable(guest)) {
    return guest.isGroup
      ? `Formas parte de la invitación de ${guest.groupLabel || guest.name}.`
      : 'Eres el invitado principal de esta invitación.'
  }
  const claims = guest.companionClaims || {}
  const claimedAsCompanion = Object.keys(claims).some((key) => claims[key] === currentUid)
  if (!claimedAsCompanion) return null
  if (guest.isGroup) {
    return `Formas parte de la invitación de ${guest.groupLabel || guest.name}.`
  }
  const principalName = fullNameOf(guest.name, guest.lastName)
  return `Estás registrado como acompañante de ${principalName}.`
}
