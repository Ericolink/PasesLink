import { collection, doc, getDocs, increment, setDoc } from 'firebase/firestore'
import { db } from './config'
import { parseUserAgent, type DeviceBrowser, type DeviceOs } from '../utils/parseUserAgent'

type DeviceBucketKind = 'os' | 'browser'

export interface DeviceBucket {
  kind: DeviceBucketKind
  key: DeviceOs | DeviceBrowser
  count: number
}

export async function getDeviceBreakdown(): Promise<DeviceBucket[]> {
  const snap = await getDocs(collection(db, 'deviceStats'))
  return snap.docs.map((d) => d.data() as DeviceBucket)
}

// Un solo `setDoc(..., {merge:true})` con `increment(1)` sirve tanto para la
// primera sesión que toca un bucket (Firestore lo trata como `create`, el
// documento resultante trae count==1, que es justo lo que exige la regla de
// create) como para las siguientes (`update`, count pasa a valorAnterior+1,
// exigido por la regla de update) — sin necesitar una transacción de
// "leer para saber si ya existe". Ver firestore.rules match /deviceStats/{bucketId}.
export async function recordDeviceSession(userAgent: string): Promise<void> {
  const { os, browser } = parseUserAgent(userAgent)
  await Promise.all([
    setDoc(doc(db, 'deviceStats', `os_${os}`), { kind: 'os', key: os, count: increment(1) }, { merge: true }),
    setDoc(
      doc(db, 'deviceStats', `browser_${browser}`),
      { kind: 'browser', key: browser, count: increment(1) },
      { merge: true },
    ),
  ])
}
