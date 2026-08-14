import { describe, expect, it } from 'vitest'
import { buildSelfRegistrationMetadata } from './buildSelfRegistrationMetadata.js'

const FALLBACK_IMAGE = 'https://app-pases-9e6e7.web.app/icons/pwa-512.png'

describe('buildSelfRegistrationMetadata', () => {
  it('builds the invitation sentence and description with the event cover image', () => {
    const event = { name: 'Baile Improvisado Vol.1', coverImage: 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg' }
    const meta = buildSelfRegistrationMetadata(event, 'Eric Muñoz', FALLBACK_IMAGE)

    expect(meta.ogTitle).toBe('Eric Muñoz te invita a Baile Improvisado Vol.1')
    expect(meta.title).toBe('Eric Muñoz te invita a Baile Improvisado Vol.1 | PaseLink')
    expect(meta.ogDescription).toBe('Regístrate y obtén tu pase con código QR para el evento.')
    expect(meta.twitterTitle).toBe(meta.ogTitle)
    expect(meta.twitterDescription).toBe(meta.ogDescription)
    expect(meta.ogImage).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_auto,w_1200,h_630,q_auto,f_auto/v1/photo.jpg',
    )
    expect(meta.twitterImage).toBe(meta.ogImage)
  })

  it('falls back to the PaseLink logo when the event has no cover image', () => {
    const meta = buildSelfRegistrationMetadata({ name: 'Fiesta sin foto' }, 'Eric Muñoz', FALLBACK_IMAGE)
    expect(meta.ogImage).toBe(FALLBACK_IMAGE)
    expect(meta.twitterImage).toBe(FALLBACK_IMAGE)
  })

  it('falls back to the PaseLink logo when coverImage is not a Cloudinary URL', () => {
    const meta = buildSelfRegistrationMetadata(
      { name: 'Fiesta con foto externa', coverImage: 'https://example.com/photo.jpg' },
      'Eric Muñoz',
      FALLBACK_IMAGE,
    )
    expect(meta.ogImage).toBe(FALLBACK_IMAGE)
  })

  it('keeps accented names intact', () => {
    const meta = buildSelfRegistrationMetadata({ name: 'Fiesta de Graduación 2026' }, 'José Ángel Muñoz', FALLBACK_IMAGE)
    expect(meta.ogTitle).toBe('José Ángel Muñoz te invita a Fiesta de Graduación 2026')
  })

  it('truncates only the event name when the combined sentence is too long', () => {
    const longEventName = 'Fiesta de Graduación de Ingeniería en Desarrollo de Software Generación 2026'
    const meta = buildSelfRegistrationMetadata(
      { name: longEventName },
      'Alejandro Fernández González',
      FALLBACK_IMAGE,
    )
    expect(meta.ogTitle.length).toBeLessThanOrEqual(115)
    expect(meta.ogTitle.startsWith('Alejandro Fernández González te invita a')).toBe(true)
    expect(meta.ogTitle.endsWith('…')).toBe(true)
  })

  it('does not truncate the event name when the inviter name alone leaves no budget', () => {
    const veryLongInviter = 'A'.repeat(120)
    const meta = buildSelfRegistrationMetadata({ name: 'Fiesta' }, veryLongInviter, FALLBACK_IMAGE)
    expect(meta.ogTitle).toBe(`${veryLongInviter} te invita a Fiesta`)
  })
})
