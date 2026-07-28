import { afterEach, expect } from 'vitest'
import { toHaveNoViolations } from 'jest-axe'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

expect.extend(toHaveNoViolations)

// @testing-library/react no se limpia solo entre tests con Vitest (a
// diferencia de Jest, donde el auto-cleanup viene por defecto) — sin esto,
// cada `render()` de un test deja su DOM montado para el siguiente, y los
// componentes que usan createPortal (AccessibleModal) se acumulan en
// document.body entre tests del mismo archivo.
afterEach(() => {
  cleanup()
})
