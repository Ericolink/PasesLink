import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccessibleModal } from './AccessibleModal'
import { checkA11y } from '../../../test/axe'

function renderModal(onClose = vi.fn()) {
  return render(
    <AccessibleModal open onClose={onClose} label="Modal de prueba">
      <button type="button">Primero</button>
      <button type="button">Segundo</button>
    </AccessibleModal>,
  )
}

describe('AccessibleModal', () => {
  it('no tiene violaciones de accesibilidad', async () => {
    renderModal()
    await checkA11y(document.body)
  })

  it('expone role="dialog" y aria-modal', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Modal de prueba' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('Escape llama a onClose', async () => {
    const onClose = vi.fn()
    renderModal(onClose)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('el foco cicla entre el primer y el último elemento (Tab/Shift+Tab)', async () => {
    renderModal()
    const first = screen.getByRole('button', { name: 'Primero' })
    const second = screen.getByRole('button', { name: 'Segundo' })
    expect(first).toHaveFocus()
    await userEvent.tab()
    expect(second).toHaveFocus()
    await userEvent.tab()
    expect(first).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(second).toHaveFocus()
  })
})
