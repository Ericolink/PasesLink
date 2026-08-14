import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GuestSearchBar } from './GuestSearchBar'
import { checkA11y } from '../test/axe'

type StatusFilter = 'all' | 'confirmed' | 'scanned' | 'declined' | 'pending'
type SortBy = 'newest' | 'oldest' | 'az' | 'za'

// Wrapper controlado: GuestSearchBar es 100% presentacional (el estado real
// vive en EventDetail.tsx), así que los tests necesitan un padre con estado
// para poder verificar el ciclo completo de interacción.
function ControlledGuestSearchBar() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('newest')
  return (
    <GuestSearchBar
      search={search}
      onSearchChange={setSearch}
      statusFilter={statusFilter}
      onStatusFilterChange={setStatusFilter}
      sortBy={sortBy}
      onSortByChange={setSortBy}
    />
  )
}

describe('GuestSearchBar', () => {
  it('el input de búsqueda está visible de entrada, sin abrir nada', () => {
    render(<ControlledGuestSearchBar />)
    expect(screen.getByRole('textbox', { name: /buscar invitado/i })).toBeVisible()
    expect(screen.queryByText('Estado')).not.toBeInTheDocument()
  })

  it('escribir en el input llama a onSearchChange en cada tecla (sin botón "Buscar")', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(
      <GuestSearchBar
        search=""
        onSearchChange={onSearchChange}
        statusFilter="all"
        onStatusFilterChange={() => {}}
        sortBy="newest"
        onSortByChange={() => {}}
      />,
    )
    await user.type(screen.getByRole('textbox', { name: /buscar invitado/i }), 'Juan')
    expect(onSearchChange).toHaveBeenCalledTimes(4)
    expect(screen.queryByRole('button', { name: /^buscar$/i })).not.toBeInTheDocument()
  })

  it('el botón "Filtros" despliega el panel con Estado y Orden', async () => {
    const user = userEvent.setup()
    render(<ControlledGuestSearchBar />)
    const filtersButton = screen.getByRole('button', { name: /^filtros$/i })
    expect(filtersButton).toHaveAttribute('aria-expanded', 'false')

    await user.click(filtersButton)
    expect(filtersButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Estado')).toBeVisible()
    expect(screen.getByText('Orden')).toBeVisible()
  })

  it('abrir filtros no borra el texto ya escrito en el buscador', async () => {
    const user = userEvent.setup()
    render(<ControlledGuestSearchBar />)
    const input = screen.getByRole('textbox', { name: /buscar invitado/i })
    await user.type(input, 'Juan')
    await user.click(screen.getByRole('button', { name: /^filtros$/i }))
    expect(input).toHaveValue('Juan')
  })

  it('seleccionar un filtro de estado muestra el chip activo con el conteo', async () => {
    const user = userEvent.setup()
    render(<ControlledGuestSearchBar />)
    await user.click(screen.getByRole('button', { name: /^filtros$/i }))
    await user.click(screen.getByRole('button', { name: 'Confirmados' }))

    const filtersButton = screen.getByRole('button', { expanded: true })
    expect(within(filtersButton).getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmados.*quitar filtro/i })).toBeInTheDocument()
  })

  it('"Limpiar filtros" restablece Estado y Orden sin tocar el texto de búsqueda', async () => {
    const user = userEvent.setup()
    render(<ControlledGuestSearchBar />)
    const input = screen.getByRole('textbox', { name: /buscar invitado/i })
    await user.type(input, 'Juan')
    await user.click(screen.getByRole('button', { name: /^filtros$/i }))
    await user.click(screen.getByRole('button', { name: 'Confirmados' }))
    await user.click(screen.getByRole('button', { name: 'A–Z' }))

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))

    expect(input).toHaveValue('Juan')
    expect(screen.queryByRole('button', { name: /quitar filtro/i })).not.toBeInTheDocument()
  })

  it('el botón "×" del input limpia la búsqueda', async () => {
    const user = userEvent.setup()
    render(<ControlledGuestSearchBar />)
    const input = screen.getByRole('textbox', { name: /buscar invitado/i })
    await user.type(input, 'Juan')
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
    expect(input).toHaveValue('')
  })

  it('no tiene violaciones de accesibilidad, con y sin filtros abiertos', async () => {
    const { container } = render(<ControlledGuestSearchBar />)
    await checkA11y(container)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^filtros$/i }))
    await checkA11y(container)
  })
})
