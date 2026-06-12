import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
/**
 * Recordatorios automáticos para eventos Premium: corre cada hora, busca eventos
 * activos y pagados cuya fecha sea "mañana", y por cada invitado con email
 * crea un documento en la colección `mail`. Ese documento es recogido por la
 * extensión oficial de Firebase "Trigger Email from Firestore"
 * (https://extensions.dev/extensions/firebase/firestore-send-email), que debe
 * instalarse y configurarse con un proveedor SMTP/SendGrid para que los
 * correos se envíen realmente.
 */
export const sendReminders = onSchedule('every 60 minutes', async () => {
    const db = getFirestore();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD
    const eventsSnapshot = await db
        .collection('events')
        .where('plan', '==', 'premium')
        .where('status', '==', 'active')
        .where('paymentStatus', '==', 'paid')
        .where('date', '==', tomorrowStr)
        .where('reminderSent', '!=', true)
        .get();
    for (const eventDoc of eventsSnapshot.docs) {
        const eventData = eventDoc.data();
        const guestsSnapshot = await eventDoc.ref.collection('guests').where('email', '!=', '').get();
        for (const guestDoc of guestsSnapshot.docs) {
            const guest = guestDoc.data();
            if (!guest.email)
                continue;
            await db.collection('mail').add({
                to: guest.email,
                message: {
                    subject: `Recordatorio: ${eventData.name} es mañana`,
                    text: `Hola ${guest.name}, te recordamos que "${eventData.name}" es mañana (${eventData.date}) en ${eventData.location}. ¡Te esperamos!`,
                },
            });
        }
        await eventDoc.ref.update({ reminderSent: true });
    }
});
