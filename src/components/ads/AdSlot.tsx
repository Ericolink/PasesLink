import { useEffect, useRef } from 'react'
import { useAdsConfig } from '../../hooks/useAdsConfig'
import { cleanEnv } from '../../utils/env'
import { ensureAdSenseLoaded, pushAdSlot } from '../../lib/adsLoader'
import { trackAdSlotView } from '../../lib/analytics'
import type { AdPlacement } from '../../types/ads'

const CLIENT_ID = cleanEnv(import.meta.env.VITE_ADSENSE_CLIENT_ID)

const SLOT_IDS: Record<AdPlacement, string> = {
  'landing-bottom': cleanEnv(import.meta.env.VITE_ADSENSE_SLOT_LANDING_BOTTOM),
  'invitation-bottom': cleanEnv(import.meta.env.VITE_ADSENSE_SLOT_INVITATION_BOTTOM),
}

interface AdSlotProps {
  placement: AdPlacement
}

// Único componente de publicidad de PaseLink — nunca montar
// <ins class="adsbygoogle"> a mano en otro lado (ver propuesta de
// monetización aprobada 2026-08-14). Los placements válidos están fijos en
// src/types/ads.ts; agregar uno nuevo ahí, no inventar strings sueltos acá.
//
// Sin ads.enabled + el placement activo en Firestore (platformConfig/ads) Y
// las credenciales de entorno (VITE_ADSENSE_CLIENT_ID + el slot de este
// placement), no renderiza absolutamente nada — ni el <aside>, ni el
// espacio reservado. Es intencional: mientras no haya cuenta de AdSense
// configurada, cero huecos en blanco en la app.
export function AdSlot({ placement }: AdSlotProps) {
  const { enabled, placements } = useAdsConfig()
  const insRef = useRef<HTMLModElement>(null)
  const pushedRef = useRef(false)
  const viewedRef = useRef(false)
  const slotId = SLOT_IDS[placement]
  const active = enabled && placements[placement] && CLIENT_ID !== '' && slotId !== ''

  // Pide el anuncio una sola vez por instancia montada — el script en sí
  // (adsbygoogle.js + el CMP) se inyecta una sola vez por sesión de página,
  // sin importar cuántos <AdSlot> distintos se monten (ver adsLoader.ts).
  useEffect(() => {
    if (!active || pushedRef.current) return
    pushedRef.current = true
    ensureAdSenseLoaded(CLIENT_ID)
    pushAdSlot()
  }, [active])

  // Métrica propia (no la de AdSense): cuántos invitados/visitantes
  // llegaron a ver el placement, para poder cruzarla más adelante contra las
  // impresiones reales que reporte AdSense. Un solo evento por montaje,
  // nunca datos del invitado/evento — solo el id del placement.
  useEffect(() => {
    if (!active) return
    const el = insRef.current
    if (!el || viewedRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !viewedRef.current) {
          viewedRef.current = true
          trackAdSlotView(placement)
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [active, placement])

  if (!active) return null

  return (
    // role="complementary" + el rótulo "Publicidad" visible evitan que el
    // anuncio se confunda con contenido de PaseLink (pedido explícito de la
    // propuesta) y avisan a lectores de pantalla que lo que sigue es
    // secundario. min-height fijo en el <ins> reserva el espacio antes de
    // que AdSense responda, para no generar CLS cuando el anuncio carga.
    <aside aria-label="Publicidad" className="w-full flex flex-col items-center gap-1.5 py-3 mt-4 border-t border-current/10">
      <span className="text-2xs font-medium uppercase tracking-wide opacity-50">Publicidad</span>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', minHeight: '100px' }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  )
}
