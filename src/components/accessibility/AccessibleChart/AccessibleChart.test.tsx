import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccessibleChart } from './AccessibleChart'
import { checkA11y } from '../../../test/axe'

describe('AccessibleChart', () => {
  it('no tiene violaciones de accesibilidad', async () => {
    render(
      <AccessibleChart summary="Total: 10 personas" caption="Por hora">
        <div aria-hidden="true">barras</div>
      </AccessibleChart>,
    )
    await checkA11y(document.body)
  })

  it('expone el resumen vía role="img" y el caption como texto visible', () => {
    render(
      <AccessibleChart summary="Total: 10 personas, pico a las 21:00" caption="Por hora">
        <div aria-hidden="true">barras</div>
      </AccessibleChart>,
    )
    expect(screen.getByRole('img', { name: 'Total: 10 personas, pico a las 21:00' })).toBeInTheDocument()
    expect(screen.getByText('Por hora')).toBeInTheDocument()
  })
})
