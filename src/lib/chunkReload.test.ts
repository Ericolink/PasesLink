import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installChunkReloadRecovery } from './chunkReload'

describe('installChunkReloadRecovery', () => {
  // jsdom define `location.reload` como no-configurable — vi.spyOn no puede
  // reemplazarlo directamente, hay que redefinir la propiedad primero.
  let reloadMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadMock },
    })
  })

  it('reloads once when a preload error fires', () => {
    installChunkReloadRecovery()

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))

    expect(reloadMock).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('pl_chunk_reload_attempted')).toBe('1')
  })

  it('does not reload a second time in the same session', () => {
    installChunkReloadRecovery()

    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))
    window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }))

    expect(reloadMock).toHaveBeenCalledTimes(1)
  })
})
