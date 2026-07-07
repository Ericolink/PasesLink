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
  // Oculto para anfitriones no-admin en TemplatePicker (ver useIsAdmin) —
  // pensado para lanzar un tema nuevo primero como evento propio de PaseLink
  // antes de abrirlo al público. No es una restricción de seguridad (nada
  // impide que un evento ya creado con este templateId siga renderizando su
  // tema), solo control de qué aparece en el selector.
  adminOnly?: boolean
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
    // Forma del confetti del check-in (canvas-confetti ya soporta formas
    // nativas). Opcional: sin este campo se usa la mezcla por defecto de la
    // librería (círculos/cuadrados).
    confettiShape?: 'star' | 'square'
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
      // Dorado foil cálido, no bronce/cuero (eso es vocabulario de vaquera) —
      // accentDark se mantiene dorado profundo, nunca marrón apagado, para
      // que el acento siga leyéndose "luminoso" incluso en sus variantes
      // oscuras (ver el override de :hover en templates.css).
      accent: '#c9a35e',
      accentDark: '#ad8542',
      accentSoft: '#f6e9d3',
      // Marfil con base rosada — papel algodón, no el marfil más amarillo/
      // documental de Graduación.
      pageBg: '#fbf2e7',
      surface: '#fffbf5',
      text: '#4a3b32',
      // Más claro que el resto de los temas a propósito: Bodas debe sentirse
      // más liviano en jerarquía visual que Graduación, nunca tan oscuro
      // como para competir con el texto principal.
      textMuted: '#9c8a7d',
      border: '#ecdcc4',
      // Cuerpo en Cormorant Garamond (override de h1 a Playfair Display
      // itálica vía templates.css, mismo mecanismo que separa el h1 Cinzel
      // del cuerpo EB Garamond en Graduación).
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      borderRadius: '1.5rem',
      shadow: '0 4px 20px rgba(201,163,94,.16)',
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
      confettiShape: 'star',
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
      // Marfil/blanco cálido en vez del blanco azulado anterior — la base
      // de un documento institucional, no de una tarjeta de "app".
      pageBg: '#f6f0e1',
      surface: '#fffdf6',
      text: '#1f2937',
      textMuted: '#4a5568',
      border: '#e3d6b0',
      // EB Garamond es el fallback real para todo el texto de lectura (RSVP,
      // muro, instrucciones) — Cinzel queda reservado a títulos/encabezados/
      // etiquetas ceremoniales vía override puntual en templates.css, nunca
      // acá: a tamaño de párrafo es una serif de capitales, poco legible.
      fontFamily: "'EB Garamond', Georgia, serif",
      borderRadius: '0.75rem',
      shadow: '0 2px 8px rgba(30,58,138,.15)',
      enterAnimation: 'animate-slide-in-up',
      // Confeti cuadrado en vez de la mezcla default de la librería: evoca
      // papeles/diplomas cayendo sin necesitar una forma custom.
      confettiShape: 'square',
    },
  },
  {
    id: 'formal',
    label: 'Evento formal',
    category: 'Evento formal',
    vars: {
      // Metal sobrio y frío (gunmetal/platino) en vez de negro plano —
      // el dorado/foil ya es materialidad exclusiva de Graduación y Bodas,
      // así que el "metálico sobrio" de Formal tiene que ser un metal
      // distinto: plata/acero, no oro. accentDark deja de ser #000000
      // (tinta pura) y pasa a un carbón-azulado, coherente con el mismo
      // metal en su variante oscura.
      accent: '#5c6470',
      accentDark: '#383d46',
      accentSoft: '#e6e8eb',
      pageBg: '#f0f0ee',
      surface: '#ffffff',
      text: '#111827',
      textMuted: '#6b7280',
      // Gris frío ligeramente más definido que antes — el mismo principio
      // de "borde fino" que ya tenía, solo más cercano a la familia del
      // nuevo acento metálico.
      border: '#d6d9dd',
      // Cuerpo en sans geométrica (ya cargada para el chrome de la app,
      // index.html) — el h1 recupera la serif vía override en
      // templates.css. Es la combinación que más aparece en papelería de
      // gala/corporativa real: un serif editorial solo para el titular,
      // sans limpia y legible para el resto ("structured typography").
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      borderRadius: '0.25rem',
      // Doble filete elegante (típico de invitaciones de gala), separado
      // del borde por un pequeño margen — mecanismo sin cambios, ahora
      // dibuja en el metal frío en vez de negro plano.
      shadow: '0 0 0 1px var(--invite-border), 0 0 0 6px var(--invite-surface), 0 0 0 7px var(--invite-accent)',
      enterAnimation: 'animate-fade-in',
    },
  },
  {
    id: 'kids',
    label: 'Fiesta infantil',
    category: 'Fiesta infantil',
    vars: {
      // Coral cálido y pastel — antes un ámbar saturado, demasiado cerca del
      // óxido de vaquera y sin el aire "pastel" que pide una celebración
      // moderna. accent/accentDark/accentSoft siguen siendo un solo matiz en
      // tres intensidades (confeti monocromático, no multicolor) para que
      // el fondo se sienta controlado, nunca caótico.
      accent: '#e8916a',
      accentDark: '#c46a3f',
      accentSoft: '#f8ddd0',
      // Durazno/crema, no el marfil rosado de Bodas ni el ámbar saturado
      // anterior — "papel de fiesta" cálido, sin convertirse en otro tema.
      pageBg: '#fbe8d8',
      surface: '#fffaf3',
      text: '#5a4133',
      textMuted: '#8a7363',
      border: '#f3ddc9',
      fontFamily: "'Baloo 2', system-ui, sans-serif",
      borderRadius: '1.75rem',
      // Sombra cálida y difusa (sin el segundo tono en línea recta que
      // tenía antes en templates.css) — "suave", no "contrastada".
      shadow: '0 10px 26px rgba(232,145,106,.22)',
      enterAnimation: 'animate-bounce-in',
    },
  },
  {
    id: 'houseparty',
    label: 'Fiesta improvisada',
    category: 'Fiesta improvisada',
    // Debut como evento propio de PaseLink primero — se abre al público
    // cuando el admin lo decida (quitar esta línea).
    adminOnly: true,
    vars: {
      // Materialidad: night-life editorial / neón líquido — ver
      // src/design-system/FIESTA_IMPROVISADA_DESIGN_SYSTEM.md (reemplaza el
      // cartel serigrafiado/riso anterior).
      // Cian eléctrico, no el magenta/violeta de marca de la app (ese es el
      // neón del chrome — .orb-1/.orb-2 en index.css —, no de un tema): el
      // acento interactivo del tema tiene que seguir leyéndose como "un
      // evento", nunca como el propio PaseLink. Los halos violeta/magenta
      // del fondo (templates.css) sí usan esa familia de color porque ahí
      // cumplen el rol puramente ambiental que les da el sistema de diseño
      // ("violeta = ambiente/lugar"), nunca el de acento interactivo.
      accent: '#22D3EE',
      // Texto legible sobre accentSoft (Avatar.tsx, badges) — un teal
      // profundo, no un cian más claro, para no repetir el acento.
      accentDark: '#0E7490',
      // Chip pálido y luminoso (Avatar/badges) — el mismo criterio de
      // "acento diluido" que el resto de los temas, aquí con temperatura
      // fría en vez de cálida.
      accentSoft: '#A5F3FC',
      // Lienzo nocturno profundo — el fondo pasa a ser el protagonista
      // (halos de neón en templates.css), no el boleto.
      pageBg: '#0B0714',
      // Superficie del boleto: un violeta-negro apenas más claro que el
      // lienzo, no gris neutro — mantiene el boleto anclado a la misma
      // temperatura de color que el fondo en vez de sentirse "pegado
      // encima" de otro material.
      surface: '#150F24',
      text: '#F5F1FF',
      textMuted: '#B9B2CE',
      // Hairline de vidrio (blanco a baja opacidad), no un borde de tinta
      // sólida — el boleto flota, no está impreso.
      border: 'rgba(255,255,255,0.14)',
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      borderRadius: '1.1rem',
      // Elevación suave + halo ambiental cian (nunca el offset duro de
      // "sticker" de la materialidad anterior): el boleto flota sobre el
      // escenario de luces, no está pegado a una superficie física.
      shadow: '0 28px 60px -16px rgba(0,0,0,.65), 0 0 42px -10px rgba(34,211,238,.35)',
      enterAnimation: 'animate-fade-in-up',
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
