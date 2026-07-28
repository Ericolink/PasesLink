import type { CSSProperties, RefObject } from 'react'
import type { ShareCardContent } from '../../utils/share/types'
import { ThemeOrnament } from '../ThemeOrnament'
import { IconMapPin } from '../accessibility/AccessibleIcon'
import type { TemplateId } from '../../types'

// Tamaño CSS del nodo capturado — junto al pixelRatio:4 de
// renderShareCardImage.ts da como resultado 1080x1920px reales, la
// proporción 9:16 nativa de Instagram Stories.
const CARD_WIDTH = 270
const CARD_HEIGHT = 480

// Franja central de proporción 4:5 (1080x1350 reales) donde debe vivir todo
// el contenido crítico (título, fecha, CTA): es más restrictiva que la zona
// segura real de Stories (~250px de chrome de Instagram arriba y abajo de un
// lienzo 1080x1920), así que sobrevive tanto a Stories como a un eventual
// recorte a Feed (Instagram no acepta 9:16 en Feed, solo hasta 4:5).
const SAFE_HEIGHT_RATIO = 1350 / 1920
const SAFE_INSET_Y = (CARD_HEIGHT * (1 - SAFE_HEIGHT_RATIO)) / 2

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// Se renderiza fuera de pantalla (nunca visible para el usuario) solo para
// que html-to-image pueda capturar su DOM. Sin lógica condicional por
// plantilla: todo viene de `content.theme`/`content.recipe`, así que un tema
// nuevo en templates/registry.ts + templates/shareRecipes.ts ya funciona acá.
export function EventShareCardTemplate({
  content,
  templateId,
  nodeRef,
}: {
  content: ShareCardContent
  templateId?: TemplateId
  nodeRef: RefObject<HTMLDivElement | null>
}) {
  const { recipe } = content
  const themeStyle = {
    '--share-accent': content.theme.accent,
    '--share-accent-dark': content.theme.accentDark,
  } as CSSProperties

  return (
    <div className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
      <div
        ref={nodeRef}
        style={{
          ...themeStyle,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          // Fondo SIEMPRE sólido, haya o no portada: si la <img> de abajo no
          // llega a capturarse (falla de CORS al cargar la portada, ver
          // renderShareCardImage.ts), este gradiente queda visible en vez de
          // dejar el PNG exportado con un fondo realmente transparente.
          background: recipe.backgroundGradient,
        }}
        className="relative overflow-hidden"
      >
        {content.coverImageUrl && (
          <img
            src={content.coverImageUrl}
            alt=""
            crossOrigin="anonymous"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Scrim siempre presente (sobre la portada o sobre el gradiente de
            fondo) — la legibilidad del texto nunca depende del contenido de
            la foto. */}
        <div className="absolute inset-0" style={{ background: recipe.scrim }} />

        <img src="/Logo.png" alt="" className="absolute top-6 left-6 h-7 w-auto opacity-80" />

        <div
          className="absolute inset-x-0 flex flex-col justify-end px-6 text-white"
          style={{ top: SAFE_INSET_Y, bottom: SAFE_INSET_Y }}
        >
          <ThemeOrnament templateId={templateId} className="w-14 h-5 mb-3 text-white/85" />

          <h1
            className="text-2xl font-bold leading-tight mb-2 line-clamp-2"
            style={{ fontFamily: recipe.headerFontFamily, textShadow: recipe.headerTextShadow }}
          >
            {content.title}
          </h1>

          <div className="flex flex-col gap-1 mb-4 text-sm opacity-95">
            {(content.dateLabel || content.timeLabel) && (
              <p>{[content.dateLabel, content.timeLabel].filter(Boolean).join(' · ')}</p>
            )}
            {content.locationLabel && (
              <p className="flex items-center gap-1.5 min-w-0">
                <IconMapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{content.locationLabel}</span>
              </p>
            )}
          </div>

          <div
            className="rounded-2xl px-4 py-3"
            style={{ backgroundColor: hexToRgba(recipe.glassTint, 0.42), backdropFilter: 'blur(6px)' }}
          >
            <p className="font-semibold text-base leading-tight">{content.ctaLabel}</p>
            <p className="text-xs text-white/75 mt-0.5">{content.domainLabel}</p>
          </div>

          <p className="text-[10px] text-white/60 text-center mt-3">Creado con PaseLink</p>
        </div>
      </div>
    </div>
  )
}
