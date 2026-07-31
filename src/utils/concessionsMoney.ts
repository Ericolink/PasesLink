// Único punto de formato de dinero del módulo de concessions — todos los
// montos se guardan en `priceMinorUnits`/`totalMinorUnits` (enteros, nunca
// float, ver src/types/concessions.ts) y se muestran divididos entre 100.
// Mismo estilo que ya usa el resto de la app para `ticketPrice`
// (EditEventForm: `${currency}${amount}`, sin espacio) — `currency` es texto
// libre elegido por el organizador (símbolo tipo "$" o código tipo "MXN"),
// no un ISO 4217 real, así que no hay Intl.NumberFormat que le calce.
export function formatMinorUnits(minorUnits: number, currency: string): string {
  return `${currency}${(minorUnits / 100).toFixed(2)}`
}

export function majorToMinorUnits(major: number): number {
  return Math.round(major * 100)
}
