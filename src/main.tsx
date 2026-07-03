import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// Activa la hoja de fuentes cargada con media="print" en index.html (truco
// para no bloquear el primer render). Antes se hacía con onload= inline, que
// una Content-Security-Policy sin 'unsafe-inline' bloquea.
document.getElementById('app-fonts')?.setAttribute('media', 'all')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
