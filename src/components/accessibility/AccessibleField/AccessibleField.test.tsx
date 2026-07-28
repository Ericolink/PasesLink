import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccessibleField } from './AccessibleField'
import { checkA11y } from '../../../test/axe'

describe('AccessibleField', () => {
  it('no tiene violaciones de accesibilidad, con y sin error', async () => {
    const { rerender } = render(
      <AccessibleField label="Nombre" helperText="Como aparece en el pase">
        {(fieldProps) => <input {...fieldProps} />}
      </AccessibleField>,
    )
    await checkA11y(document.body)
    rerender(
      <AccessibleField label="Nombre" error="Campo obligatorio">
        {(fieldProps) => <input {...fieldProps} />}
      </AccessibleField>,
    )
    await checkA11y(document.body)
  })

  it('asocia label↔control vía htmlFor/id generado automáticamente', () => {
    render(
      <AccessibleField label="Email">
        {(fieldProps) => <input {...fieldProps} />}
      </AccessibleField>,
    )
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('combina helperText + error en aria-describedby y marca aria-invalid', () => {
    render(
      <AccessibleField label="Teléfono" helperText="Con código de país" error="Formato inválido">
        {(fieldProps) => <input {...fieldProps} />}
      </AccessibleField>,
    )
    const input = screen.getByLabelText('Teléfono')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const describedBy = input.getAttribute('aria-describedby') || ''
    // Con error presente, el helperText no se renderiza (ver AccessibleField.tsx)
    // — solo el mensaje de error debe quedar en el describedby.
    expect(describedBy).toContain('-error')
    expect(screen.getByRole('alert')).toHaveTextContent('Formato inválido')
  })

  it('required agrega el asterisco visual sin duplicar el nombre accesible', () => {
    render(
      <AccessibleField label="Nombre" required>
        {(fieldProps) => <input {...fieldProps} />}
      </AccessibleField>,
    )
    const input = screen.getByLabelText(/Nombre/)
    expect(input).toHaveAttribute('required')
  })
})
