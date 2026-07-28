import { axe } from 'jest-axe'
import { expect } from 'vitest'

// `region` (todo el contenido debe estar dentro de un landmark) es una regla
// de auditoría de PÁGINA COMPLETA — en un test de componente aislado (un
// <div> sin <main>/<nav> alrededor) siempre dispara, sin ser un problema
// real del componente. Se desactiva acá, no en cada test.
export async function checkA11y(container: Element) {
  const results = await axe(container, { rules: { region: { enabled: false } } })
  expect(results).toHaveNoViolations()
}
