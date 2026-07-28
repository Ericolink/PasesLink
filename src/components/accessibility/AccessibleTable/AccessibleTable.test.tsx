import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccessibleTable, SortableTh } from './AccessibleTable'
import { EmptyRow } from './EmptyRow'
import { checkA11y } from '../../../test/axe'

describe('AccessibleTable', () => {
  it('no tiene violaciones de accesibilidad', async () => {
    render(
      <AccessibleTable caption="Lista de prueba">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ana</td>
          </tr>
        </tbody>
      </AccessibleTable>,
    )
    await checkA11y(document.body)
  })

  it('el caption queda sr-only pero accesible', () => {
    render(
      <AccessibleTable caption="Lista de clientes">
        <tbody><tr><td>x</td></tr></tbody>
      </AccessibleTable>,
    )
    expect(screen.getByText('Lista de clientes')).toBeInTheDocument()
  })

  it('EmptyRow muestra el mensaje dado', () => {
    render(<EmptyRow message="No hay resultados." />)
    expect(screen.getByText('No hay resultados.')).toBeInTheDocument()
  })
})

describe('SortableTh', () => {
  it('expone aria-sort según el estado activo/dirección', () => {
    const { rerender } = render(
      <table><thead><tr><SortableTh label="Fecha" active={false} dir="asc" onClick={vi.fn()} /></tr></thead></table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'none')

    rerender(
      <table><thead><tr><SortableTh label="Fecha" active dir="desc" onClick={vi.fn()} /></tr></thead></table>,
    )
    expect(screen.getByRole('columnheader')).toHaveAttribute('aria-sort', 'descending')
  })

  it('onClick se dispara al hacer click en el botón', async () => {
    const onClick = vi.fn()
    render(
      <table><thead><tr><SortableTh label="Fecha" active={false} dir="asc" onClick={onClick} /></tr></thead></table>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Fecha' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
