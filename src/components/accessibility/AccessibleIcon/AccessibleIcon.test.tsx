import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccessibleIcon } from './AccessibleIcon'
import { IconStar } from './Icons'
import { checkA11y } from '../../../test/axe'

describe('AccessibleIcon', () => {
  it('no tiene violaciones de accesibilidad', async () => {
    render(<AccessibleIcon icon={IconStar} label="Favorito" />)
    await checkA11y(document.body)
  })

  it('expone role="img" y el aria-label dado, con el svg interno oculto', () => {
    render(<AccessibleIcon icon={IconStar} label="Favorito" />)
    const img = screen.getByRole('img', { name: 'Favorito' })
    expect(img.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('los íconos decorativos (sin AccessibleIcon) siguen ocultos por defecto', () => {
    render(<IconStar />)
    const svg = document.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })
})
