import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, uniqueId } from '../__tests__/helpers.js'
import { applyStatusUpdate, extractStatusUpdates, isValidSignature, verifyChallenge } from './whatsappWebhook.js'

describe('verifyChallenge', () => {
  it('returns the challenge when mode and token match', () => {
    const result = verifyChallenge({ 'hub.mode': 'subscribe', 'hub.verify_token': 'secret', 'hub.challenge': 'abc123' }, 'secret')
    expect(result).toBe('abc123')
  })

  it('returns null when the verify token does not match', () => {
    const result = verifyChallenge({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'abc123' }, 'secret')
    expect(result).toBeNull()
  })

  it('returns null when the secret itself is not configured', () => {
    const result = verifyChallenge({ 'hub.mode': 'subscribe', 'hub.verify_token': 'secret', 'hub.challenge': 'abc123' }, undefined)
    expect(result).toBeNull()
  })

  it('returns null for a mode other than subscribe', () => {
    const result = verifyChallenge({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'secret', 'hub.challenge': 'abc123' }, 'secret')
    expect(result).toBeNull()
  })
})

describe('isValidSignature', () => {
  const appSecret = 'app-secret-123'

  it('accepts a correctly signed body', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }))
    const signature = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`
    expect(isValidSignature(body, signature, appSecret)).toBe(true)
  })

  it('rejects a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ hello: 'world' }))
    const signature = `sha256=${createHmac('sha256', appSecret).update(body).digest('hex')}`
    const tamperedBody = Buffer.from(JSON.stringify({ hello: 'tampered' }))
    expect(isValidSignature(tamperedBody, signature, appSecret)).toBe(false)
  })

  it('rejects a missing signature header', () => {
    const body = Buffer.from('{}')
    expect(isValidSignature(body, undefined, appSecret)).toBe(false)
  })

  it('rejects when the app secret is not configured', () => {
    const body = Buffer.from('{}')
    expect(isValidSignature(body, 'sha256=whatever', undefined)).toBe(false)
  })

  it('rejects a malformed header without the sha256= prefix', () => {
    const body = Buffer.from('{}')
    expect(isValidSignature(body, 'plain-hex-value', appSecret)).toBe(false)
  })
})

describe('extractStatusUpdates', () => {
  it('parses a well-formed Meta status payload', () => {
    const payload = {
      entry: [
        {
          changes: [
            { value: { statuses: [{ id: 'wamid.1', status: 'delivered' }, { id: 'wamid.2', status: 'read' }] } },
          ],
        },
      ],
    }
    expect(extractStatusUpdates(payload)).toEqual([
      { messageId: 'wamid.1', status: 'delivered' },
      { messageId: 'wamid.2', status: 'read' },
    ])
  })

  it('ignores an unrelated payload shape instead of throwing', () => {
    expect(extractStatusUpdates({ entry: [{ changes: [{ value: { messages: [{ id: 'inbound' }] } }] }] })).toEqual([])
    expect(extractStatusUpdates({})).toEqual([])
    expect(extractStatusUpdates(null)).toEqual([])
    expect(extractStatusUpdates('not even an object')).toEqual([])
  })

  it('ignores a status with an unrecognized value', () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'weird' }] } }] }] }
    expect(extractStatusUpdates(payload)).toEqual([])
  })
})

describe('applyStatusUpdate', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('updates the matching sendLog doc by providerMessageId', async () => {
    const eventId = uniqueId('event')
    const logRef = db.collection('events').doc(eventId).collection('sendLog').doc('log-1')
    await logRef.set({ status: 'sent', channel: 'whatsapp', providerMessageId: 'wamid.abc' })

    await applyStatusUpdate(db, { messageId: 'wamid.abc', status: 'delivered' })

    const snap = await logRef.get()
    expect(snap.data()?.whatsappDeliveryStatus).toBe('delivered')
  })

  it('does nothing when no sendLog matches the message id', async () => {
    await expect(applyStatusUpdate(db, { messageId: 'wamid.unknown', status: 'read' })).resolves.toBeUndefined()
  })
})
