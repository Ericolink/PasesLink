import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { processMessageCampaign, type MessageCampaign } from './campaign.js'

async function seedContact(db: Firestore, eventId: string, guestId: string, email: string) {
  await db.collection('events').doc(eventId).collection('guestContacts').doc(guestId).set({ email })
}

describe('processMessageCampaign', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('logs skipped_no_email and marks the campaign failed when nobody has an email (mismo criterio que el script original: sin envíos exitosos, cuenta como falla)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuest(db, eventId, 'guest-1')
    const campaignRef = db.collection('events').doc(eventId).collection('messageCampaigns').doc(uniqueId('campaign'))
    const campaign: MessageCampaign = { eventId, subject: 'Aviso', bodyText: 'Hola a todos', guestIds: ['guest-1'] }
    await campaignRef.set({ ...campaign, status: 'queued' })

    await processMessageCampaign(db, campaignRef, campaign)

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog')
      .doc(`mass_${campaignRef.id}_guest-1`).get()
    expect(logSnap.data()?.status).toBe('skipped_no_email')

    const campaignSnap = await campaignRef.get()
    expect(campaignSnap.data()?.status).toBe('failed')
    expect(campaignSnap.data()?.processedAt).toBeDefined()
  })

  it('skips a guestId that no longer exists, without creating a log', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const campaignRef = db.collection('events').doc(eventId).collection('messageCampaigns').doc(uniqueId('campaign'))
    const campaign: MessageCampaign = { eventId, subject: 'Aviso', bodyText: 'Hola', guestIds: ['no-existe'] }
    await campaignRef.set({ ...campaign, status: 'queued' })

    await processMessageCampaign(db, campaignRef, campaign)

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog')
      .doc(`mass_${campaignRef.id}_no-existe`).get()
    expect(logSnap.exists).toBe(false)
    const campaignSnap = await campaignRef.get()
    expect(campaignSnap.data()?.status).toBe('sent')
  })

  it('logs the attempt per guest with an email and marks the campaign failed without Brevo credentials configured', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuest(db, eventId, 'guest-1', { name: 'Ana' })
    await seedContact(db, eventId, 'guest-1', 'ana@test.com')
    const campaignRef = db.collection('events').doc(eventId).collection('messageCampaigns').doc(uniqueId('campaign'))
    const campaign: MessageCampaign = { eventId, subject: 'Aviso', bodyText: 'Hola Ana', guestIds: ['guest-1'] }
    await campaignRef.set({ ...campaign, status: 'queued' })

    await processMessageCampaign(db, campaignRef, campaign)

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog')
      .doc(`mass_${campaignRef.id}_guest-1`).get()
    // Sin BREVO_API_KEY en el entorno de test, sendEmail falla limpio — ver
    // el mismo criterio ya usado en waitlist/notify.test.ts.
    expect(logSnap.data()?.status).toBe('failed')

    const campaignSnap = await campaignRef.get()
    expect(campaignSnap.data()?.status).toBe('failed')
  })

  it('never processes the same guestId twice for the same campaign (dedup vía sendLog.create())', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuest(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'ana@test.com')
    const campaignRef = db.collection('events').doc(eventId).collection('messageCampaigns').doc(uniqueId('campaign'))
    const campaign: MessageCampaign = { eventId, subject: 'Aviso', bodyText: 'Hola', guestIds: ['guest-1'] }
    await campaignRef.set({ ...campaign, status: 'queued' })

    await processMessageCampaign(db, campaignRef, campaign)
    await processMessageCampaign(db, campaignRef, campaign)

    const budgetSnap = await db.collection('sendBudget').doc(
      new Date().toISOString().slice(0, 10),
    ).get()
    // Un solo intento consumió el presupuesto — el segundo llamado chocó
    // contra el .create() del log y ni siquiera pidió un slot.
    expect(budgetSnap.data()?.count).toBe(1)
  })
})
