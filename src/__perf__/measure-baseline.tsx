// Harness de medición de rendimiento para EventAnalytics + GuestList.
// No es parte del bundle de producción ni se ejecuta en `npm run test`
// (no matchea el patrón */*.test.tsx de vitest) — se invoca a mano con
// un runner puntual. Se deja como referencia para medir regresiones futuras.
/* eslint-disable react-refresh/only-export-components -- no es un módulo de componentes de la app, no participa de Fast Refresh */
import { Profiler, type ProfilerOnRenderCallback } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { EventAnalytics } from '../components/EventAnalytics'
import { GuestList } from '../components/GuestList'
import type { GuestData } from '../types'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

export function generateGuests(count: number, checkedInCount: number): GuestData[] {
  const now = Date.now()
  const guests: GuestData[] = []
  for (let i = 0; i < count; i++) {
    const isCheckedIn = i < checkedInCount
    guests.push({
      id: `guest-${i}`,
      name: `Invitado ${i}`,
      lastName: `Apellido ${i}`,
      phone: '',
      qrToken: `token-${i}`,
      status: isCheckedIn ? 'checked_in' : 'invited',
      companions: Array.from({ length: i % 3 }, () => ({})),
      rsvpStatus: isCheckedIn ? 'yes' : i % 2 === 0 ? 'pending' : 'no',
      checkedInAt: isCheckedIn ? now - (i % 12) * 3_600_000 : null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      lockToken: null,
      paymentStatus: 'unpaid',
      createdAt: now,
    })
  }
  return guests
}

interface MeasureResult {
  commits: number
  totalMs: number
  durations: number[]
}

// Simula el patrón real de EventDetail.tsx: un padre que re-renderiza por
// estado propio no relacionado (ej. un toast de check-in, un contador) sin
// que los datos de `guests` cambien. Las "50 eventos" del enunciado se
// traducen aquí en 50 commits de re-render con la MISMA referencia de
// `guests` — el escenario exacto que React.memo está pensado para evitar.
function Page({ guests, tick }: { guests: GuestData[]; tick: number }) {
  return (
    <MemoryRouter>
      <div>
        <span>{tick}</span>
        <EventAnalytics guests={guests} />
        <GuestList eventId="evt-perf" guests={guests} />
      </div>
    </MemoryRouter>
  )
}

export async function measureRerenders(guests: GuestData[], rerenders: number): Promise<MeasureResult> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const durations: number[] = []
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actualDuration) => {
    durations.push(actualDuration)
  }

  await act(async () => {
    root.render(
      <Profiler id="page" onRender={onRender}>
        <Page guests={guests} tick={0} />
      </Profiler>,
    )
  })

  for (let i = 1; i <= rerenders; i++) {
    await act(async () => {
      root.render(
        <Profiler id="page" onRender={onRender}>
          <Page guests={guests} tick={i} />
        </Profiler>,
      )
    })
  }

  await act(async () => {
    root.unmount()
  })
  container.remove()

  return {
    commits: durations.length,
    totalMs: durations.reduce((sum, d) => sum + d, 0),
    durations,
  }
}
