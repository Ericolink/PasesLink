import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from './emailChannel.js'

const ORIGINAL_ENV = { ...process.env }

function withCredentials() {
  process.env.BREVO_API_KEY = 'test-key'
  process.env.BREVO_SENDER_EMAIL = 'no-reply@paselink.com'
}

describe('sendEmail', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
  })

  it('falla limpio sin lanzar cuando faltan las credenciales', async () => {
    delete process.env.BREVO_API_KEY
    delete process.env.BREVO_SENDER_EMAIL
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await sendEmail({ toEmail: 'ana@test.com', subject: 'Hola', html: '<p>hola</p>' })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: false,
      error: 'Falta BREVO_API_KEY o BREVO_SENDER_EMAIL',
      errorKind: 'missing_credentials',
    })
  })

  it('devuelve ok:true cuando Brevo responde 200', async () => {
    withCredentials()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' }))

    const result = await sendEmail({ toEmail: 'ana@test.com', subject: 'Hola', html: '<p>hola</p>' })

    expect(result).toEqual({ ok: true })
  })

  it('clasifica 401 por IP no autorizada, extrae la IP y no expone la API key', async () => {
    withCredentials()
    const body = JSON.stringify({
      message:
        'We have detected you are using an unrecognised IP address 2600:1900:0:2d04::d00. If you performed this action make sure to add the new IP address in this link: https://app.brevo.com/security/authorised_ips',
      code: 'unauthorized',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => body }))

    const result = await sendEmail({ toEmail: 'ana@test.com', subject: 'Hola', html: '<p>hola</p>' })

    expect(result.ok).toBe(false)
    expect(result.errorKind).toBe('unauthorized_ip')
    expect(result.error).toContain('2600:1900:0:2d04::d00')
    expect(result.error).toContain('authorised_ips')
    expect(result.error).not.toContain('test-key')
  })

  it('distingue 401 por API key inválida de 401 por IP no autorizada', async () => {
    withCredentials()
    const body = JSON.stringify({ message: 'Key not found', code: 'unauthorized' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => body }))

    const result = await sendEmail({ toEmail: 'ana@test.com', subject: 'Hola', html: '<p>hola</p>' })

    expect(result.ok).toBe(false)
    expect(result.errorKind).toBe('invalid_api_key')
    expect(result.error).not.toContain('test-key')
  })

  it('clasifica 400 como solicitud inválida (ej. email mal formado)', async () => {
    withCredentials()
    const body = JSON.stringify({ message: 'Invalid email address', code: 'invalid_parameter' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => body }))

    const result = await sendEmail({ toEmail: 'no-es-un-email', subject: 'Hola', html: '<p>hola</p>' })

    expect(result.ok).toBe(false)
    expect(result.errorKind).toBe('invalid_request')
    expect(result.error).toContain('Invalid email address')
  })

  it('clasifica 429 como rate limit', async () => {
    withCredentials()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => JSON.stringify({ message: 'Too many requests' }) }),
    )

    const result = await sendEmail({ toEmail: 'ana@test.com', subject: 'Hola', html: '<p>hola</p>' })

    expect(result.ok).toBe(false)
    expect(result.errorKind).toBe('rate_limited')
  })

  it('clasifica 500 como error del proveedor, no cuelga el registro', async () => {
    withCredentials()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => JSON.stringify({ message: 'Internal error' }) }),
    )

    const result = await sendEmail({ toEmail: 'ana@test.com', subject: 'Hola', html: '<p>hola</p>' })

    expect(result.ok).toBe(false)
    expect(result.errorKind).toBe('server_error')
  })

  it('clasifica un AbortError como timeout', async () => {
    withCredentials()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        return Promise.reject(err)
      }),
    )

    const result = await sendEmail({ toEmail: 'ana@test.com', subject: 'Hola', html: '<p>hola</p>' })

    expect(result).toEqual({ ok: false, error: 'Brevo no respondió a tiempo (timeout).', errorKind: 'timeout' })
  })

  it('clasifica un error de red (fetch rechaza) como network_error', async () => {
    withCredentials()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))

    const result = await sendEmail({ toEmail: 'ana@test.com', subject: 'Hola', html: '<p>hola</p>' })

    expect(result.ok).toBe(false)
    expect(result.errorKind).toBe('network_error')
    expect(result.error).toBe('fetch failed')
  })
})
