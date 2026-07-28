import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnnouncementProvider, useAnnouncer } from './AnnouncementContext'
import { checkA11y } from '../../../test/axe'

function Announcer({ message, politeness }: { message: string; politeness?: 'polite' | 'assertive' }) {
  const { announce } = useAnnouncer()
  return <button type="button" onClick={() => announce(message, politeness)}>Anunciar</button>
}

describe('AnnouncementProvider / useAnnouncer', () => {
  it('no tiene violaciones de accesibilidad', async () => {
    render(
      <AnnouncementProvider>
        <Announcer message="Invitado agregado" />
      </AnnouncementProvider>,
    )
    await checkA11y(document.body)
  })

  it('monta 2 regiones fijas (polite y assertive) desde el montaje, no dinámicas', () => {
    render(
      <AnnouncementProvider>
        <Announcer message="x" />
      </AnnouncementProvider>,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('announce() escribe el mensaje en la región polite por defecto', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(
      <AnnouncementProvider>
        <Announcer message="Invitado agregado: Ana" />
      </AnnouncementProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Anunciar' }))
    // requestAnimationFrame difiere la escritura un frame — esperar a que aparezca.
    expect(await screen.findByText('Invitado agregado: Ana')).toBeInTheDocument()
  })
})
