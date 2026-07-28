import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tab, TabList, TabPanel, Tabs } from './Tabs'
import { checkA11y } from '../../../test/axe'

function Demo() {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a')
  return (
    <Tabs value={value} onChange={setValue}>
      <TabList aria-label="Ejemplo">
        <Tab value="a" label="Uno" />
        <Tab value="b" label="Dos" />
        <Tab value="c" label="Tres" />
      </TabList>
      <TabPanel value="a">Panel uno</TabPanel>
      <TabPanel value="b">Panel dos</TabPanel>
      <TabPanel value="c">Panel tres</TabPanel>
    </Tabs>
  )
}

describe('AccessibleTabs', () => {
  it('no tiene violaciones de accesibilidad', async () => {
    render(<Demo />)
    await checkA11y(document.body)
  })

  it('ArrowRight mueve el foco y selecciona el siguiente tab (activación automática)', async () => {
    render(<Demo />)
    const tabUno = screen.getByRole('tab', { name: 'Uno' })
    tabUno.focus()
    await userEvent.keyboard('{ArrowRight}')
    const tabDos = screen.getByRole('tab', { name: 'Dos' })
    expect(tabDos).toHaveFocus()
    expect(tabDos).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Panel dos')).toBeVisible()
  })

  it('End mueve al último tab con wrap circular en ArrowRight', async () => {
    render(<Demo />)
    screen.getByRole('tab', { name: 'Uno' }).focus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('tab', { name: 'Tres' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Uno' })).toHaveFocus()
  })

  it('solo el tab activo tiene tabIndex=0 (roving tabindex)', () => {
    render(<Demo />)
    expect(screen.getByRole('tab', { name: 'Uno' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Dos' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tab', { name: 'Tres' })).toHaveAttribute('tabindex', '-1')
  })
})
