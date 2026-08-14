import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedUserProfile, uniqueId } from '../__tests__/helpers.js'
import { parseEventIdFromPath, renderEventJoinHtml } from './eventJoinMeta.js'

const BASE_HTML = `<!doctype html>
<html lang="es"><head>
<title>PaseLink - Gestión de invitados para eventos</title>
<meta property="og:title" content="PaseLink - Gestión de invitados para eventos" />
<meta property="og:description" content="Crea eventos, envía invitaciones digitales con QR y controla el acceso de tus invitados en tiempo real." />
<meta property="og:url" content="https://app-pases-9e6e7.web.app/" />
<meta property="og:image" content="https://app-pases-9e6e7.web.app/icons/pwa-512.png" />
<meta name="twitter:title" content="PaseLink - Gestión de invitados para eventos" />
<meta name="twitter:description" content="Crea eventos, envía invitaciones digitales con QR y controla el acceso de tus invitados en tiempo real." />
<meta name="twitter:image" content="https://app-pases-9e6e7.web.app/icons/pwa-512.png" />
</head><body><div id="root"></div></body></html>`

const BASE_URL = 'https://app-pases-9e6e7.web.app'

describe('parseEventIdFromPath', () => {
  it('extracts the event id from /e/:id', () => {
    expect(parseEventIdFromPath('/e/evt-123')).toBe('evt-123')
  })

  it('handles a trailing slash', () => {
    expect(parseEventIdFromPath('/e/evt-123/')).toBe('evt-123')
  })

  it('decodes URL-encoded ids', () => {
    expect(parseEventIdFromPath('/e/evt%20123')).toBe('evt 123')
  })

  it('returns null for a path without an id', () => {
    expect(parseEventIdFromPath('/e/')).toBeNull()
    expect(parseEventIdFromPath('/e')).toBeNull()
  })

  it('returns null for an unrelated path', () => {
    expect(parseEventIdFromPath('/events/evt-123/join')).toBeNull()
  })
})

describe('renderEventJoinHtml', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('personalizes title/og/twitter tags for an open self-registration event', async () => {
    const eventId = uniqueId('event')
    const ownerId = uniqueId('owner')
    await seedEvent(db, eventId, { ownerId, name: 'Baile Improvisado Vol.1', entryMode: 'open' })
    await seedUserProfile(db, ownerId, { displayName: 'Eric Muñoz' })

    const html = await renderEventJoinHtml({
      db,
      fetchBaseHtml: async () => BASE_HTML,
      eventId,
      refUid: null,
      baseUrl: BASE_URL,
    })

    expect(html).toContain('<title>Eric Muñoz te invita a Baile Improvisado Vol.1 | PaseLink</title>')
    expect(html).toContain('<meta property="og:title" content="Eric Muñoz te invita a Baile Improvisado Vol.1" />')
    expect(html).toContain(`<meta property="og:url" content="${BASE_URL}/e/${eventId}" />`)
    expect(html).toContain('<meta property="og:image" content="https://app-pases-9e6e7.web.app/icons/pwa-512.png" />')
  })

  it('attributes the invitation to a verified collaborator, not the owner', async () => {
    const eventId = uniqueId('event')
    const ownerId = uniqueId('owner')
    const collaboratorUid = uniqueId('collab')
    await seedEvent(db, eventId, {
      ownerId,
      name: 'Fiesta de Graduación',
      entryMode: 'open',
      collaborators: { [collaboratorUid]: { role: 'administrador' } },
    })
    await seedUserProfile(db, ownerId, { displayName: 'Eric Muñoz' })
    await seedUserProfile(db, collaboratorUid, { displayName: 'Carlos López' })

    const html = await renderEventJoinHtml({
      db,
      fetchBaseHtml: async () => BASE_HTML,
      eventId,
      refUid: collaboratorUid,
      baseUrl: BASE_URL,
    })

    expect(html).toContain('Carlos López te invita a Fiesta de Graduación')
    expect(html).not.toContain('Eric Muñoz te invita')
  })

  it('returns the base html unmodified for a non-existent event', async () => {
    const html = await renderEventJoinHtml({
      db,
      fetchBaseHtml: async () => BASE_HTML,
      eventId: 'does-not-exist',
      refUid: null,
      baseUrl: BASE_URL,
    })
    expect(html).toBe(BASE_HTML)
  })

  it('returns the base html unmodified for a list-only (invite-only) event', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { entryMode: 'list' })

    const html = await renderEventJoinHtml({
      db,
      fetchBaseHtml: async () => BASE_HTML,
      eventId,
      refUid: null,
      baseUrl: BASE_URL,
    })
    expect(html).toBe(BASE_HTML)
  })
})
