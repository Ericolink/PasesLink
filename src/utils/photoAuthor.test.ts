import { describe, expect, it } from 'vitest'
import { hashGuestQrToken } from './photoAuthor'

// Tokens ficticios con el formato real de generateQrToken (randomUUID sin guiones).
const TOKEN_A = '0f1e2d3c4b5a69788796a5b4c3d2e1f0'
const TOKEN_B = 'aaaabbbbccccddddeeeeffff00001111'

describe('hashGuestQrToken', () => {
  it('matches the standard SHA-256 test vector', async () => {
    // FIPS 180-2, "abc".
    expect(await hashGuestQrToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('returns 64 lowercase hex characters and never the token itself', async () => {
    const hash = await hashGuestQrToken(TOKEN_A)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(TOKEN_A)
  })

  it('is stable for the same author (two photos, same hash)', async () => {
    expect(await hashGuestQrToken(TOKEN_A)).toBe(await hashGuestQrToken(TOKEN_A))
  })

  it('gives different hashes for different authors', async () => {
    expect(await hashGuestQrToken(TOKEN_A)).not.toBe(await hashGuestQrToken(TOKEN_B))
  })
})
