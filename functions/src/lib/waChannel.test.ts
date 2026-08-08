import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isWhatsAppConfigured, sendWhatsAppTemplate } from './waChannel.js'

const ORIGINAL_ENV = { ...process.env }

describe('isWhatsAppConfigured', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('is false without credentials', () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
    expect(isWhatsAppConfigured()).toBe(false)
  })

  it('is true once both credentials are present', () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    expect(isWhatsAppConfigured()).toBe(true)
  })
})

describe('sendWhatsAppTemplate', () => {
  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123456'
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
  })

  it('fails fast without credentials, never calling fetch', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await sendWhatsAppTemplate({
      toPhone: '+525512345678',
      templateKind: 'waitlist_offer',
      vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' },
    })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('not_configured')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects an invalid phone number without calling the API', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await sendWhatsAppTemplate({
      toPhone: 'not-a-phone',
      templateKind: 'waitlist_offer',
      vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' },
    })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('invalid_phone')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends a valid E.164 number and returns the provider message id on success', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.abc123' }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await sendWhatsAppTemplate({
      toPhone: '+525512345678',
      templateKind: 'waitlist_offer',
      vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' },
    })

    expect(result.ok).toBe(true)
    expect(result.providerMessageId).toBe('wamid.abc123')

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toContain('/123456/messages')
    const body = JSON.parse(init.body)
    expect(body.to).toBe('525512345678')
    expect(body.template.name).toBe('oferta_lugar')
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual([
      'Ana',
      'Fiesta',
      'mañana',
      'https://x',
    ])
  })

  it('classifies an expired token (Meta code 190) distinctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { code: 190 } }) }),
    )

    const result = await sendWhatsAppTemplate({
      toPhone: '+525512345678',
      templateKind: 'reconfirm_request',
      vars: { guestName: 'Ana', organizerName: 'Org', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' },
    })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('token_expired')
  })

  it('classifies a rejected/nonexistent template (Meta code 132001) distinctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { code: 132001 } }) }),
    )

    const result = await sendWhatsAppTemplate({
      toPhone: '+525512345678',
      templateKind: 'waitlist_offer',
      vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' },
    })

    expect(result.errorCode).toBe('template_not_found')
  })

  it('classifies a rate limit (Meta code 80007) distinctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: { code: 80007 } }) }),
    )

    const result = await sendWhatsAppTemplate({
      toPhone: '+525512345678',
      templateKind: 'waitlist_offer',
      vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' },
    })

    expect(result.errorCode).toBe('rate_limited')
  })

  it('never throws on a network failure — returns a typed error instead', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await sendWhatsAppTemplate({
      toPhone: '+525512345678',
      templateKind: 'waitlist_offer',
      vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' },
    })

    expect(result.ok).toBe(false)
    expect(result.errorCode).toBe('http_error')
  })
})
