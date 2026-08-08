import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// messaging.ts lee VITE_FIREBASE_VAPID_KEY una sola vez al importarse — cada
// test que necesita un valor distinto usa vi.stubEnv + vi.resetModules() y
// vuelve a importar el módulo, en vez de mutar una constante ya capturada.

const updateDocMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const arrayUnionMock = vi.hoisted(() => vi.fn((value: string) => ({ __op: 'arrayUnion', value })))
const arrayRemoveMock = vi.hoisted(() => vi.fn((value: string) => ({ __op: 'arrayRemove', value })))
const docMock = vi.hoisted(() => vi.fn(() => ({ __ref: true })))

vi.mock('firebase/firestore', () => ({
  doc: docMock,
  updateDoc: updateDocMock,
  arrayUnion: arrayUnionMock,
  arrayRemove: arrayRemoveMock,
}))

vi.mock('./config', () => ({ app: {}, db: {} }))

const captureExceptionMock = vi.hoisted(() => vi.fn())
vi.mock('../lib/sentry', () => ({ captureException: captureExceptionMock }))

const getMessagingMock = vi.hoisted(() => vi.fn(() => ({})))
const getTokenMock = vi.hoisted(() => vi.fn())
const deleteTokenMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('firebase/messaging', () => ({
  getMessaging: getMessagingMock,
  getToken: getTokenMock,
  deleteToken: deleteTokenMock,
}))

const registerMock = vi.fn()
const getRegistrationMock = vi.fn()

function stubSupportedBrowser(permission: 'default' | 'denied' | 'granted') {
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn().mockResolvedValue(permission),
  })
  vi.stubGlobal('navigator', {
    serviceWorker: { register: registerMock, getRegistration: getRegistrationMock },
  })
}

describe('src/firebase/messaging.ts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    updateDocMock.mockClear()
    arrayUnionMock.mockClear()
    arrayRemoveMock.mockClear()
    getTokenMock.mockReset()
    deleteTokenMock.mockClear()
    captureExceptionMock.mockClear()
    registerMock.mockReset()
    getRegistrationMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('sin VITE_FIREBASE_VAPID_KEY configurada', () => {
    it('requestPushPermission devuelve el error de configuración sin tocar el navegador', async () => {
      vi.stubEnv('VITE_FIREBASE_VAPID_KEY', '')
      const { requestPushPermission } = await import('./messaging')

      const result = await requestPushPermission('uid-1')

      expect(result).toEqual({ ok: false, error: 'Push todavía no está configurado (falta la clave VAPID).' })
      expect(updateDocMock).not.toHaveBeenCalled()
    })

    it('disablePushOnThisDevice es un no-op', async () => {
      vi.stubEnv('VITE_FIREBASE_VAPID_KEY', '')
      const { disablePushOnThisDevice } = await import('./messaging')

      await disablePushOnThisDevice('uid-1')

      expect(updateDocMock).not.toHaveBeenCalled()
      expect(deleteTokenMock).not.toHaveBeenCalled()
    })
  })

  describe('navegador sin soporte', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'test-vapid-key')
      vi.stubGlobal('Notification', undefined)
    })

    it('getPushPermissionState devuelve "unsupported"', async () => {
      const { getPushPermissionState } = await import('./messaging')
      expect(getPushPermissionState()).toBe('unsupported')
    })

    it('requestPushPermission devuelve un mensaje claro sin pedir permiso', async () => {
      const { requestPushPermission } = await import('./messaging')

      const result = await requestPushPermission('uid-1')

      expect(result).toEqual({ ok: false, error: 'Este navegador no soporta notificaciones push.' })
    })
  })

  describe('navegador compatible, VAPID configurada', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_FIREBASE_VAPID_KEY', 'test-vapid-key')
    })

    it('getPushPermissionState refleja Notification.permission', async () => {
      stubSupportedBrowser('denied')
      const { getPushPermissionState } = await import('./messaging')
      expect(getPushPermissionState()).toBe('denied')
    })

    it('usuario rechaza el permiso: mensaje accionable, sin registrar token', async () => {
      stubSupportedBrowser('denied')
      const { requestPushPermission } = await import('./messaging')

      const result = await requestPushPermission('uid-1')

      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/configuración de tu navegador/)
      expect(registerMock).not.toHaveBeenCalled()
      expect(updateDocMock).not.toHaveBeenCalled()
    })

    it('permiso concedido pero getToken no devuelve token: error claro', async () => {
      stubSupportedBrowser('granted')
      registerMock.mockResolvedValue({ __registration: true })
      getTokenMock.mockResolvedValue(null)
      const { requestPushPermission } = await import('./messaging')

      const result = await requestPushPermission('uid-1')

      expect(result).toEqual({ ok: false, error: 'No se pudo generar el token de notificaciones.' })
      expect(updateDocMock).not.toHaveBeenCalled()
    })

    it('flujo exitoso: registra el service worker y guarda el token con arrayUnion', async () => {
      stubSupportedBrowser('granted')
      registerMock.mockResolvedValue({ __registration: true })
      getTokenMock.mockResolvedValue('fcm-token-abc')
      const { requestPushPermission } = await import('./messaging')

      const result = await requestPushPermission('uid-1')

      expect(result).toEqual({ ok: true })
      expect(registerMock).toHaveBeenCalledTimes(1)
      expect(arrayUnionMock).toHaveBeenCalledWith('fcm-token-abc')
      expect(updateDocMock).toHaveBeenCalledTimes(1)
    })

    it('un error inesperado se reporta a Sentry y devuelve un mensaje genérico', async () => {
      stubSupportedBrowser('granted')
      registerMock.mockRejectedValue(new Error('registro falló'))
      const { requestPushPermission } = await import('./messaging')

      const result = await requestPushPermission('uid-1')

      expect(result).toEqual({ ok: false, error: 'No se pudo activar las notificaciones. Intenta de nuevo.' })
      expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    })

    it('disablePushOnThisDevice quita el token de este dispositivo sin afectar otros', async () => {
      getRegistrationMock.mockResolvedValue({ __registration: true })
      getTokenMock.mockResolvedValue('fcm-token-abc')
      stubSupportedBrowser('granted')
      const { disablePushOnThisDevice } = await import('./messaging')

      await disablePushOnThisDevice('uid-1')

      expect(arrayRemoveMock).toHaveBeenCalledWith('fcm-token-abc')
      expect(updateDocMock).toHaveBeenCalledTimes(1)
      expect(deleteTokenMock).toHaveBeenCalledTimes(1)
    })

    it('disablePushOnThisDevice sin token registrado en este dispositivo no borra nada', async () => {
      getRegistrationMock.mockResolvedValue(undefined)
      getTokenMock.mockRejectedValue(new Error('no registration'))
      stubSupportedBrowser('granted')
      const { disablePushOnThisDevice } = await import('./messaging')

      await disablePushOnThisDevice('uid-1')

      expect(updateDocMock).not.toHaveBeenCalled()
      expect(deleteTokenMock).not.toHaveBeenCalled()
    })
  })
})
