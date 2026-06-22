import type { CSSProperties } from 'react'
import type { TemplateId } from '../types'

// Nombre de una clase de animación de entrada YA definida en src/index.css
// (animate-fade-in-up, animate-fade-in, animate-bounce-in, animate-slide-in-up).
// No agrega CSS nuevo, solo elige cuál de las existentes usa cada tema.
export type EnterAnimation = 'animate-fade-in-up' | 'animate-fade-in' | 'animate-bounce-in' | 'animate-slide-in-up'

export interface InvitationTemplate {
  id: TemplateId
  label: string
  category: string
  vars: {
    accent: string
    accentDark: string
    accentSoft: string
    pageBg: string
    surface: string
    text: string
    textMuted: string
    border: string
    fontFamily: string
    borderRadius: string
    shadow: string
    enterAnimation: EnterAnimation
  }
}

// Fuente única de verdad para los temas visuales de la invitación. Agregar
// una plantilla nueva = un objeto más en este array (+ opcionalmente un
// ornamento en ornaments.tsx y/o un patrón decorativo en styles/templates.css).
// No hace falta tocar InvitationThemeRoot, InvitationCard, GuestPass,
// EventMap, WallSection ni TemplatePicker.
export const INVITATION_TEMPLATES: InvitationTemplate[] = [
  {
    id: 'default',
    label: 'Predeterminado',
    category: 'Genérico',
    vars: {
      accent: '#2563eb',
      accentDark: '#1d4ed8',
      accentSoft: '#dbeafe',
      pageBg: '#eef1f5',
      surface: '#ffffff',
      text: '#111827',
      textMuted: '#6b7280',
      border: '#e5e7eb',
      fontFamily: 'inherit',
      borderRadius: '0.75rem',
      shadow: '0 1px 3px rgba(0,0,0,.08)',
      enterAnimation: 'animate-fade-in-up',
    },
  },
  {
    id: 'wedding',
    label: 'Boda',
    category: 'Boda',
    vars: {
      accent: '#b08968',
      accentDark: '#8a6a4f',
      accentSoft: '#f1e4d8',
      pageBg: '#f3decb',
      surface: '#fffaf6',
      text: '#3f2d22',
      textMuted: '#6b5847',
      border: '#e8d9c8',
      fontFamily: "'Playfair Display', Georgia, serif",
      borderRadius: '1.5rem',
      shadow: '0 4px 18px rgba(176,137,104,.18)',
      enterAnimation: 'animate-fade-in',
    },
  },
  {
    id: 'cowboy',
    label: 'Fiesta vaquera',
    category: 'Fiesta vaquera',
    vars: {
      accent: '#a8451f',
      accentDark: '#7c3216',
      accentSoft: '#f0d9c2',
      pageBg: '#e8c89a',
      surface: '#fbf1de',
      text: '#4a2c14',
      textMuted: '#6b4a32',
      border: '#d8b98e',
      fontFamily: "'Rye', Georgia, serif",
      borderRadius: '0.4rem',
      shadow: '0 2px 0 rgba(74,44,20,.25)',
      enterAnimation: 'animate-bounce-in',
    },
  },
  {
    id: 'graduation',
    label: 'Graduación',
    category: 'Graduación',
    vars: {
      accent: '#1e3a8a',
      accentDark: '#152a63',
      accentSoft: '#dbe4f7',
      pageBg: '#d7e0f3',
      surface: '#f7f9fd',
      text: '#1f2937',
      textMuted: '#4a5568',
      border: '#cdd6e8',
      fontFamily: 'inherit',
      borderRadius: '0.75rem',
      shadow: '0 2px 8px rgba(30,58,138,.15)',
      enterAnimation: 'animate-slide-in-up',
    },
  },
  {
    id: 'anniversary',
    label: 'Aniversario',
    category: 'Aniversario',
    vars: {
      accent: '#9d174d',
      accentDark: '#771239',
      accentSoft: '#f7dce6',
      pageBg: '#f6d3e3',
      surface: '#fff7fa',
      text: '#3f1224',
      textMuted: '#7a4760',
      border: '#f0cfdd',
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      borderRadius: '1.25rem',
      shadow: '0 3px 14px rgba(157,23,77,.16)',
      enterAnimation: 'animate-fade-in',
    },
  },
  {
    id: 'formal',
    label: 'Evento formal',
    category: 'Evento formal',
    vars: {
      accent: '#111827',
      accentDark: '#000000',
      accentSoft: '#e5e7eb',
      pageBg: '#f0f0ee',
      surface: '#ffffff',
      text: '#111827',
      textMuted: '#6b7280',
      border: '#d1d5db',
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      borderRadius: '0.25rem',
      // En vez de una sombra: un doble filete elegante (típico de
      // invitaciones de gala), separado del borde por un pequeño margen.
      shadow: '0 0 0 1px var(--invite-border), 0 0 0 6px var(--invite-surface), 0 0 0 7px var(--invite-accent)',
      enterAnimation: 'animate-fade-in',
    },
  },
  {
    id: 'casual',
    label: 'Evento casual',
    category: 'Evento casual',
    vars: {
      accent: '#0d9488',
      accentDark: '#0a6f64',
      accentSoft: '#cdf2ec',
      pageBg: '#cdeee6',
      surface: '#f8fefc',
      text: '#0f2e2a',
      textMuted: '#456b62',
      border: '#cdeee6',
      fontFamily: 'inherit',
      borderRadius: '1.25rem',
      shadow: '0 2px 10px rgba(13,148,136,.12)',
      enterAnimation: 'animate-slide-in-up',
    },
  },
  {
    id: 'kids',
    label: 'Fiesta infantil',
    category: 'Fiesta infantil',
    vars: {
      accent: '#f59e0b',
      accentDark: '#d97706',
      accentSoft: '#fde9c4',
      pageBg: '#fde2b0',
      surface: '#fffbeb',
      text: '#3f2d05',
      textMuted: '#7d5f28',
      border: '#f6dca3',
      fontFamily: "'Baloo 2', system-ui, sans-serif",
      borderRadius: '1.75rem',
      shadow: '0 4px 14px rgba(245,158,11,.25)',
      enterAnimation: 'animate-bounce-in',
    },
  },
  {
    id: 'birthday',
    label: 'Cumpleaños',
    category: 'Cumpleaños',
    vars: {
      accent: '#db2777',
      accentDark: '#a8175c',
      accentSoft: '#fbd5e8',
      pageBg: '#f9c9e0',
      surface: '#fff8fb',
      text: '#3f0a26',
      textMuted: '#7d3f5e',
      border: '#f7c3dd',
      fontFamily: "'Baloo 2', system-ui, sans-serif",
      borderRadius: '1.75rem',
      shadow: '0 4px 14px rgba(219,39,119,.22)',
      enterAnimation: 'animate-bounce-in',
    },
  },
  {
    id: 'corporate',
    label: 'Cena empresarial',
    category: 'Cena empresarial',
    vars: {
      accent: '#334155',
      accentDark: '#1e293b',
      accentSoft: '#e2e8f0',
      pageBg: '#e2e8f0',
      surface: '#ffffff',
      text: '#0f172a',
      textMuted: '#64748b',
      border: '#d8dee8',
      fontFamily: 'inherit',
      borderRadius: '0.5rem',
      shadow: '0 1px 4px rgba(15,23,42,.1)',
      enterAnimation: 'animate-fade-in',
    },
  },
]

export function getTemplate(id?: TemplateId | string): InvitationTemplate {
  return INVITATION_TEMPLATES.find((t) => t.id === id) ?? INVITATION_TEMPLATES[0]
}

export interface InviteThemeStyle {
  dataTemplate: TemplateId
  style: CSSProperties
}

type TemplateVars = InvitationTemplate['vars']

// Único punto que traduce "qué tema eligió el anfitrión" a variables CSS.
// `overrides` es un subconjunto cualquiera de los tokens del tema — hoy solo
// se usa para pisar `accent` con event.accentColor, pero el mismo mecanismo
// sirve para futuras personalizaciones por evento (fuente, animación, etc.)
// sin tener que tocar esta función ni InvitationThemeRoot otra vez.
export function buildInviteThemeStyle(templateId?: TemplateId | string, overrides?: Partial<TemplateVars>): InviteThemeStyle {
  const template = getTemplate(templateId)
  const v = { ...template.vars, ...overrides }
  return {
    dataTemplate: template.id,
    style: {
      '--invite-accent': v.accent,
      '--invite-accent-dark': v.accentDark,
      '--invite-accent-soft': v.accentSoft,
      '--invite-page-bg': v.pageBg,
      '--invite-surface': v.surface,
      '--invite-text': v.text,
      '--invite-text-muted': v.textMuted,
      '--invite-border': v.border,
      '--invite-font': v.fontFamily,
      '--invite-radius': v.borderRadius,
      '--invite-shadow': v.shadow,
    } as CSSProperties,
  }
}

export function getEnterAnimationClass(templateId?: TemplateId | string): EnterAnimation {
  return getTemplate(templateId).vars.enterAnimation
}
