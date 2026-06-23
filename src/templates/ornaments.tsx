import type { FC } from 'react'
import type { TemplateId } from '../types'

interface OrnamentProps {
  className?: string
}

// SVG inline, mismo patrón que src/components/Icons.tsx (currentColor, sin
// peso de red). Todos los temas tienen un ornamento propio salvo "default"
// (la línea base neutra, a propósito).

const WeddingOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 16" fill="none" stroke="currentColor" strokeWidth={1.2}>
    <path d="M32 8c-6-6-14-6-18 0 4 4 12 4 18 0Zm0 0c6-6 14-6 18 0-4 4-12 4-18 0Z" />
    <circle cx="32" cy="8" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)

const CowboyOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M12 1.5l2.7 6.4 6.9.6-5.3 4.5 1.7 6.7L12 16.1l-6 3.6 1.7-6.7-5.3-4.5 6.9-.6L12 1.5z" />
  </svg>
)

// Reemplaza un mortarboard literal (clip-art de "graduación escolar") por
// un trazo neutro — línea/punto/línea, misma familia minimal que
// FormalOrnament — para no reforzar la lectura "escuela secundaria" en un
// tema pensado como documento institucional.
const GraduationOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 12" fill="none" stroke="currentColor" strokeWidth={1.1}>
    <line x1="0" y1="6" x2="26" y2="6" />
    <circle cx="32" cy="6" r="2.6" fill="currentColor" stroke="none" />
    <line x1="38" y1="6" x2="64" y2="6" />
  </svg>
)

const AnniversaryOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 14" fill="none" stroke="currentColor" strokeWidth={1.4}>
    <circle cx="9" cy="7" r="5.3" />
    <circle cx="15" cy="7" r="5.3" />
  </svg>
)

const KidsOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 20" fill="none" stroke="currentColor" strokeWidth={1.3}>
    <ellipse cx="10" cy="8" rx="6" ry="7.5" />
    <ellipse cx="24" cy="6" rx="6" ry="7.5" />
    <ellipse cx="38" cy="8" rx="6" ry="7.5" />
    <path d="M10 15.5 9 19M24 13.5l-1 5M38 15.5l-1 3.5" strokeLinecap="round" />
  </svg>
)

const BirthdayOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 20" fill="currentColor" stroke="none">
    <circle cx="6" cy="10" r="2" />
    <circle cx="14" cy="4" r="1.6" />
    <circle cx="34" cy="4" r="1.6" />
    <circle cx="42" cy="10" r="2" />
    <circle cx="22" cy="3" r="1.4" />
    <path d="M24 2 22.4 7.2 27.6 5.4 24 10l3.6 4.6-5.2-1.8L24 18l-1.6-5.2-5.2 1.8L21 10l-3.6-4.6 5.2 1.8L24 2Z" />
  </svg>
)

const FormalOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 64 12" fill="none" stroke="currentColor" strokeWidth={1}>
    <line x1="0" y1="6" x2="26" y2="6" />
    <rect x="30" y="2" width="4" height="4" transform="rotate(45 32 6)" fill="currentColor" stroke="none" />
    <line x1="38" y1="6" x2="64" y2="6" />
  </svg>
)

const CasualOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 40 16" fill="none" stroke="currentColor" strokeWidth={1.3}>
    <path d="M20 14C20 14 8 12 4 4c8 0 13 3 16 8 3-5 8-8 16-8-4 8-16 10-16 10Z" />
    <path d="M20 14V6" strokeLinecap="round" />
  </svg>
)

const CorporateOrnament: FC<OrnamentProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 14" fill="none" stroke="currentColor" strokeWidth={1.4}>
    <path d="M2 2v4M2 2h4" strokeLinecap="square" />
    <circle cx="24" cy="7" r="1.6" fill="currentColor" stroke="none" />
    <path d="M46 12v-4M46 12h-4" strokeLinecap="square" />
  </svg>
)

export const ORNAMENTS: Partial<Record<TemplateId, FC<OrnamentProps>>> = {
  wedding: WeddingOrnament,
  cowboy: CowboyOrnament,
  graduation: GraduationOrnament,
  anniversary: AnniversaryOrnament,
  kids: KidsOrnament,
  birthday: BirthdayOrnament,
  formal: FormalOrnament,
  casual: CasualOrnament,
  corporate: CorporateOrnament,
}
