export interface WeatherSnapshot {
  tempMaxC: number
  tempMinC: number
  conditionLabel: string
  icon: string
}

// Horizonte de pronóstico diario de Open-Meteo — pedir una fecha más lejana
// no falla necesariamente, pero devuelve datos de baja confianza / vacíos;
// mejor no mostrar nada que un pronóstico engañoso para una boda en 3 meses.
const FORECAST_HORIZON_DAYS = 16

// Códigos WMO (https://open-meteo.com/en/docs, tabla "WMO Weather interpretation
// codes") reducidos a las categorías que le importan a un invitado eligiendo
// ropa/transporte — no se modela cada matiz (ej. intensidad de nieve).
const WEATHER_CODE_MAP: Record<number, { label: string; icon: string }> = {
  0: { label: 'Despejado', icon: '☀️' },
  1: { label: 'Mayormente despejado', icon: '🌤️' },
  2: { label: 'Parcialmente nublado', icon: '⛅' },
  3: { label: 'Nublado', icon: '☁️' },
  45: { label: 'Neblina', icon: '🌫️' },
  48: { label: 'Neblina', icon: '🌫️' },
  51: { label: 'Llovizna ligera', icon: '🌦️' },
  53: { label: 'Llovizna', icon: '🌦️' },
  55: { label: 'Llovizna intensa', icon: '🌧️' },
  61: { label: 'Lluvia ligera', icon: '🌦️' },
  63: { label: 'Lluvia', icon: '🌧️' },
  65: { label: 'Lluvia intensa', icon: '🌧️' },
  71: { label: 'Nieve ligera', icon: '🌨️' },
  73: { label: 'Nieve', icon: '❄️' },
  75: { label: 'Nieve intensa', icon: '❄️' },
  80: { label: 'Chubascos ligeros', icon: '🌦️' },
  81: { label: 'Chubascos', icon: '🌧️' },
  82: { label: 'Chubascos intensos', icon: '⛈️' },
  95: { label: 'Tormenta', icon: '⛈️' },
  96: { label: 'Tormenta con granizo', icon: '⛈️' },
  99: { label: 'Tormenta con granizo', icon: '⛈️' },
}

function labelForWeatherCode(code: number): { label: string; icon: string } {
  return WEATHER_CODE_MAP[code] || { label: 'Sin datos', icon: '🌡️' }
}

// Gratis, sin API key — nada que ocultar server-side para este endpoint.
// Devuelve null ante cualquier error, fecha fuera de horizonte, o respuesta
// sin datos — el llamador (useEventWeather) trata null como "no hay clima
// que mostrar", nunca como un estado de error a exhibir.
export async function fetchWeatherForecast(lat: number, lng: number, dateISO: string): Promise<WeatherSnapshot | null> {
  const daysAhead = Math.floor((new Date(dateISO).getTime() - Date.now()) / 86_400_000)
  if (daysAhead < 0 || daysAhead > FORECAST_HORIZON_DAYS) return null

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${dateISO}&end_date=${dateISO}`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json()
    const code = data?.daily?.weathercode?.[0]
    const tempMax = data?.daily?.temperature_2m_max?.[0]
    const tempMin = data?.daily?.temperature_2m_min?.[0]
    if (typeof code !== 'number' || typeof tempMax !== 'number' || typeof tempMin !== 'number') return null
    const { label, icon } = labelForWeatherCode(code)
    return { tempMaxC: Math.round(tempMax), tempMinC: Math.round(tempMin), conditionLabel: label, icon }
  } catch {
    return null
  }
}
