import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccessibleButton } from './AccessibleButton'
import { checkA11y } from '../../../test/axe'

describe('AccessibleButton', () => {
  it('no tiene violaciones de accesibilidad (variante normal e icon-only)', async () => {
    render(
      <>
        <AccessibleButton>Guardar</AccessibleButton>
        <AccessibleButton iconOnly aria-label="Cerrar">×</AccessibleButton>
      </>,
    )
    await checkA11y(document.body)
  })

  it('iconOnly aplica el tamaño mínimo táctil 44×44 (min-w-11 min-h-11)', () => {
    render(<AccessibleButton iconOnly aria-label="Cerrar">×</AccessibleButton>)
    const button = screen.getByRole('button', { name: 'Cerrar' })
    expect(button.className).toMatch(/min-w-11/)
    expect(button.className).toMatch(/min-h-11/)
  })

  it('loading fuerza disabled y aria-busy', () => {
    render(<AccessibleButton loading>Guardando…</AccessibleButton>)
    const button = screen.getByRole('button', { name: 'Guardando…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('type por defecto es "button" (no envía forms sin querer)', () => {
    render(<AccessibleButton>Acción</AccessibleButton>)
    expect(screen.getByRole('button', { name: 'Acción' })).toHaveAttribute('type', 'button')
  })
})
