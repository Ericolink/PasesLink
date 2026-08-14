// Metadata de un enlace de auto-registro (LinkType 'self_registration', ver
// types.ts) — español neutro latinoamericano, sin voseo (ver
// SPANISH_STYLE_GUIDE.md). Los strings devueltos acá son texto crudo, sin
// escapar: el escape HTML pasa una sola vez, en injectMetaTags.ts, para no
// duplicar/desalinear esa lógica.
import { ogCropUrl } from './cloudinaryOgImage.js'
import type { LinkMetadata } from './types.js'

const DESCRIPTION = 'Regístrate y obtén tu pase con código QR para el evento.'

// Tope generoso para la frase "{invitador} te invita a {evento}" — evita
// una preview absurdamente larga sin cortar de forma fea en el caso común.
// Si igual el nombre del invitador solo ya se acerca al tope, no se trunca
// nada (mejor una frase larga que una rota).
const MAX_SENTENCE_LENGTH = 115
const CONNECTOR = ' te invita a '

function buildInvitationSentence(creatorName: string, eventName: string): string {
  const budget = MAX_SENTENCE_LENGTH - creatorName.length - CONNECTOR.length
  if (budget > 1 && eventName.length > budget) {
    const truncatedEvent = `${eventName.slice(0, budget - 1).trimEnd()}…`
    return `${creatorName}${CONNECTOR}${truncatedEvent}`
  }
  return `${creatorName}${CONNECTOR}${eventName}`
}

export function buildSelfRegistrationMetadata(
  event: { name: string; coverImage?: string | null },
  creatorName: string,
  fallbackImageUrl: string,
): LinkMetadata {
  const sentence = buildInvitationSentence(creatorName, event.name)
  const image = (event.coverImage ? ogCropUrl(event.coverImage) : null) ?? fallbackImageUrl

  return {
    title: `${sentence} | PaseLink`,
    ogTitle: sentence,
    ogDescription: DESCRIPTION,
    ogImage: image,
    twitterTitle: sentence,
    twitterDescription: DESCRIPTION,
    twitterImage: image,
  }
}
