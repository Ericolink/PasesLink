import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { sendReportNotificationEmail } from './onReportCreated.js'

describe('sendReportNotificationEmail', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('does nothing without REPORT_ADMIN_EMAIL configured (nunca seteado en tests)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const reportRef = db.collection('reports').doc(uniqueId('report'))
    await reportRef.set({ eventId, eventName: 'Evento de prueba', contentType: 'comment', reason: 'spam' })

    await sendReportNotificationEmail(db, reportRef, { eventId, eventName: 'Evento de prueba', contentType: 'comment', reason: 'spam' })

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc(`report_${reportRef.id}`).get()
    expect(logSnap.exists).toBe(false)
  })

  it('does nothing when the report has no eventId', async () => {
    process.env.REPORT_ADMIN_EMAIL = 'admin@test.com'
    try {
      const reportRef = db.collection('reports').doc(uniqueId('report'))
      await expect(sendReportNotificationEmail(db, reportRef, { reason: 'spam' })).resolves.toBeUndefined()
    } finally {
      delete process.env.REPORT_ADMIN_EMAIL
    }
  })

  it('logs the attempt under the event sendLog and fails cleanly without Brevo credentials', async () => {
    process.env.REPORT_ADMIN_EMAIL = 'admin@test.com'
    try {
      const eventId = uniqueId('event')
      await seedEvent(db, eventId)
      const reportRef = db.collection('reports').doc(uniqueId('report'))
      const report = { eventId, eventName: 'Evento de prueba', contentType: 'photo', contentAuthorName: 'Autor', reporterName: 'Reportante', anonymous: false, reason: 'spam' }
      await reportRef.set(report)

      await sendReportNotificationEmail(db, reportRef, report)

      const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc(`report_${reportRef.id}`).get()
      expect(logSnap.exists).toBe(true)
      expect(logSnap.data()?.toEmail).toBe('admin@test.com')
      expect(logSnap.data()?.status).toBe('failed')
    } finally {
      delete process.env.REPORT_ADMIN_EMAIL
    }
  })

  it('never processes the same report twice (dedup vía sendLog.create())', async () => {
    process.env.REPORT_ADMIN_EMAIL = 'admin@test.com'
    try {
      const eventId = uniqueId('event')
      await seedEvent(db, eventId)
      const reportRef = db.collection('reports').doc(uniqueId('report'))
      const report = { eventId, eventName: 'Evento de prueba', contentType: 'comment', reason: 'spam' }
      await reportRef.set(report)

      await sendReportNotificationEmail(db, reportRef, report)
      await expect(sendReportNotificationEmail(db, reportRef, report)).resolves.toBeUndefined()
    } finally {
      delete process.env.REPORT_ADMIN_EMAIL
    }
  })
})
