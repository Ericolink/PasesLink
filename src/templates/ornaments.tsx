import type { FC } from 'react'

export interface OrnamentProps {
  className?: string
}

// SVG inline, mismo patrón que src/components/Icons.tsx (currentColor, sin
// peso de red). Todos los temas tienen un ornamento propio salvo "default"
// (la línea base neutra, a propósito).

// Ramita floral fina y asimétrica — papelería editorial, no ilustración
// decorativa cargada. Las hojas son trazo abierto (stroke, sin relleno),
// como una plancha de grabado botánico, no un ícono de hoja plana: cada una
// suma una vena interior como hairline. El brote final son tres puntos de
// tamaño y opacidad irregulares (no un trío idéntico) — la misma lógica de
// "evitar simetría perfecta" que el fondo del tema.
export const WeddingOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 16" fill="none" stroke="currentColor" strokeWidth={0.85}>
    <path d="M1 10.5c8-5.5 16-6.5 23-3.4 4.6 2 6.6 4.7 11 3.6 7-1.8 11-5.8 17.5-5.2" strokeLinecap="round" />
    <path d="M11.5 6.6c1.3-2.3 3.2-3.1 4.8-2-.4 2.3-2.5 3.5-4.8 2Z" opacity=".9" />
    <path d="M12.6 6.1 15.8 5" strokeWidth="0.6" opacity=".7" />
    <path d="M24 11.4c1.1-2.3 3-3.2 4.7-2.2-.5 2.3-2.5 3.5-4.7 2.2Z" opacity=".75" />
    <path d="M25.1 10.7 28.2 9.5" strokeWidth="0.6" opacity=".6" />
    <circle cx="47" cy="5.2" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="50.2" cy="7.6" r="0.65" fill="currentColor" stroke="none" opacity=".85" />
    <circle cx="48.4" cy="3.4" r="0.55" fill="currentColor" stroke="none" opacity=".7" />
  </svg>
)

export const CowboyOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 1.5l2.7 6.4 6.9.6-5.3 4.5 1.7 6.7L12 16.1l-6 3.6 1.7-6.7-5.3-4.5 6.9-.6L12 1.5z" />
  </svg>
)

// Reemplaza un mortarboard literal (clip-art de "graduación escolar") por
// un trazo neutro — línea/punto/línea, misma familia minimal que
// FormalOrnament — para no reforzar la lectura "escuela secundaria" en un
// tema pensado como documento institucional.
export const GraduationOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 12" fill="none" stroke="currentColor" strokeWidth={1.1}>
    <line x1="0" y1="6" x2="26" y2="6" />
    <circle cx="32" cy="6" r="2.6" fill="currentColor" stroke="none" />
    <line x1="38" y1="6" x2="64" y2="6" />
  </svg>
)

// Puñado de confeti, no globos de clip-art: el motivo del tema (ver fondo en
// templates.css) repetido a escala de ornamento — cuatro puntos de tamaño y
// opacidad irregulares, sin eje de simetría, para que se sienta liviano y
// fotografiado en vez de un ícono de UI o un sticker.
export const KidsOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 16" fill="currentColor" stroke="none">
    <circle cx="14" cy="8" r="3.4" opacity=".9" />
    <circle cx="24" cy="5.5" r="2" opacity=".7" />
    <circle cx="33" cy="10.5" r="2.6" opacity=".55" />
    <circle cx="20" cy="12.5" r="1.4" opacity=".8" />
  </svg>
)

// Hairline más fino + rombo en trazo (antes relleno sólido) — la misma
// composición línea-rombo-línea, ahora más cercana a un monograma grabado
// que a un ícono de UI. Sin cambiar la forma, solo el peso del trazo.
export const FormalOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 12" fill="none" stroke="currentColor" strokeWidth={0.85}>
    <line x1="0" y1="6" x2="26" y2="6" />
    <rect x="29.5" y="3.5" width="5" height="5" transform="rotate(45 32 6)" />
    <line x1="38" y1="6" x2="64" y2="6" />
  </svg>
)
