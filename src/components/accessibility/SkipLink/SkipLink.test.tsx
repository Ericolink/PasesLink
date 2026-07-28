import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SkipLink } from './SkipLink'
import { checkA11y } from '../../../test/axe'

describe('SkipLink', () => {
  it('no tiene violaciones de accesibilidad', async () => {
    render(<><SkipLink /><main id="main-content" tabIndex={-1}>Contenido</main></>)
    await checkA11y(document.body)
  })

  it('apunta al target por defecto (#main-content) con el texto por defecto', () => {
    render(<SkipLink />)
    const link = screen.getByRole('link', { name: 'Saltar al contenido' })
    expect(link).toHaveAttribute('href', '#main-content')
  })

  it('es configurable: targetId y children propios', () => {
    render(<SkipLink targetId="contenido-principal">Ir al contenido</SkipLink>)
    const link = screen.getByRole('link', { name: 'Ir al contenido' })
    expect(link).toHaveAttribute('href', '#contenido-principal')
  })
})
