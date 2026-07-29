import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Accordion, AccordionItem } from './Accordion'
import { checkA11y } from '../../../test/axe'

function Demo({ allowMultipleExpanded = true }: { allowMultipleExpanded?: boolean }) {
  return (
    <Accordion allowMultipleExpanded={allowMultipleExpanded}>
      <AccordionItem id="uno" header="Uno" defaultExpanded>
        <p>Contenido uno</p>
      </AccordionItem>
      <AccordionItem id="dos" header="Dos">
        <p>Contenido dos</p>
      </AccordionItem>
      <AccordionItem id="tres" header="Tres">
        <p>Contenido tres</p>
      </AccordionItem>
    </Accordion>
  )
}

describe('AccessibleAccordion', () => {
  it('no tiene violaciones de accesibilidad', async () => {
    render(<Demo />)
    await checkA11y(document.body)
  })

  it('el primer item respeta defaultExpanded y el resto arranca colapsado', () => {
    render(<Demo />)
    expect(screen.getByRole('button', { name: /uno/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /dos/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Contenido uno')).toBeInTheDocument()
    expect(screen.queryByText('Contenido dos')).not.toBeInTheDocument()
  })

  it('clic alterna aria-expanded y monta/mantiene montado el contenido', async () => {
    render(<Demo />)
    const dosButton = screen.getByRole('button', { name: /dos/i })
    await userEvent.click(dosButton)
    expect(dosButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Contenido dos')).toBeInTheDocument()

    await userEvent.click(dosButton)
    expect(dosButton).toHaveAttribute('aria-expanded', 'false')
    // Se mantiene montado tras la primera apertura (para animar el cierre).
    expect(screen.getByText('Contenido dos')).toBeInTheDocument()
  })

  it('Enter y Space activan el header (botón nativo)', async () => {
    render(<Demo />)
    const dosButton = screen.getByRole('button', { name: /dos/i })
    dosButton.focus()
    await userEvent.keyboard('{Enter}')
    expect(dosButton).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard(' ')
    expect(dosButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('ArrowDown/ArrowUp/Home/End navegan el foco entre headers con wrap', async () => {
    render(<Demo />)
    screen.getByRole('button', { name: /uno/i }).focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: /dos/i })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('button', { name: /tres/i })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: /uno/i })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('button', { name: /tres/i })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('button', { name: /uno/i })).toHaveFocus()
  })

  it('aria-controls de cada header apunta a un panel real con el mismo id', () => {
    render(<Demo />)
    const unoButton = screen.getByRole('button', { name: /uno/i })
    const panelId = unoButton.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId!)).toHaveAttribute('aria-labelledby', unoButton.id)
  })

  it('allowMultipleExpanded=false cierra el resto al abrir uno nuevo', async () => {
    render(<Demo allowMultipleExpanded={false} />)
    const unoButton = screen.getByRole('button', { name: /uno/i })
    const dosButton = screen.getByRole('button', { name: /dos/i })
    expect(unoButton).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(dosButton)
    expect(dosButton).toHaveAttribute('aria-expanded', 'true')
    expect(unoButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('un item sin abrir nunca no monta su contenido (lazy render)', () => {
    render(<Demo />)
    expect(screen.queryByText('Contenido tres')).not.toBeInTheDocument()
  })
})
