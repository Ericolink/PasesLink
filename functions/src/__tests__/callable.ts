// Construye un CallableRequest falso para invocar `.run()` directo sobre
// una Callable Function exportada (soportado nativamente por
// firebase-functions v2, sin necesitar el emulador de Functions ni
// firebase-functions-test — ver CallableFunction.run() en la librería).
// `rawRequest`/`token`/`rawToken` no se usan en la lógica de negocio de
// este proyecto (solo `data`/`auth.uid`), así que se castean vacíos.
import type { CallableRequest } from 'firebase-functions/v2/https'

export function fakeCallableRequest<T>(data: T, uid?: string): CallableRequest<T> {
  const auth = uid ? { uid, token: {}, rawToken: '' } : undefined
  return { data, auth, rawRequest: {} } as unknown as CallableRequest<T>
}
