import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * Cuando un invitado hace check-in en un evento Premium, registramos una
 * notificación en /events/{eventId}/notifications para que el organizador
 * la vea en tiempo real desde el dashboard (o, más adelante, vía push/email).
 */
export const onCheckIn = onDocumentCreated('events/{eventId}/checkins/{checkinId}', async (event) => {
  const snapshot = event.data
  if (!snapshot) return

  const db = getFirestore()
  const eventRef = db.collection('events').doc(event.params.eventId)
  const eventDoc = await eventRef.get()
  const eventData = eventDoc.data()
  if (!eventData || eventData.plan !== 'premium') return

  const checkin = snapshot.data()
  await eventRef.collection('notifications').add({
    type: 'check_in',
    guestName: checkin.guestName,
    createdAt: new Date(),
    read: false,
  })
})
