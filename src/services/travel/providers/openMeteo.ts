import { fetchWeatherForecast } from '../../../utils/weather'
import type { WeatherProvider } from '../types'

// Envoltorio delgado sobre el cliente de clima que ya existe (useEventWeather
// lo usa directo) — no se duplica el fetch, solo se lo expone con la forma de
// WeatherProvider para que departureCalculator.ts no dependa de un proveedor
// concreto.
export const openMeteoProvider: WeatherProvider = {
  id: 'open-meteo',
  getForecast: (coords, dateISO) => fetchWeatherForecast(coords.lat, coords.lng, dateISO),
}
