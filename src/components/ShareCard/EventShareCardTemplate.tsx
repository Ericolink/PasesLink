import type { CSSProperties, RefObject } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import type { ShareCardContent } from '../../utils/share/types'
import { IconMapPin } from '../Icons'

// Tamaño CSS del nodo capturado — junto al pixelRatio:4 de
// renderShareCardImage.ts da como resultado 1080x1920px reales, la
// proporción 9:16 nativa de Instagram Stories.
const CARD_WIDTH = 270
const CARD_HEIGHT = 480

// Se renderiza fuera de pantalla (nunca visible para el usuario) solo para
// que html-to-image pueda capturar su DOM. Sin lógica condicional por
// plantilla: los colores vienen enteramente de `content.theme`, así que un
// tema nuevo en templates/registry.ts ya funciona acá.
export function EventShareCardTemplate({
  content,
  nodeRef,
}: {
  content: ShareCardContent
  nodeRef: RefObject<HTMLDivElement | null>
}) {
  const themeStyle = {
    '--share-accent': content.theme.accent,
    '--share-accent-dark': content.theme.accentDark,
    '--share-text-muted': content.theme.textMuted,
  } as CSSProperties

  return (
    <div className="fixed -left-[9999px] top-0 pointer-events-none" aria-hidden="true">
      <div
        ref={nodeRef}
        style={{
          ...themeStyle,
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          fontFamily: content.theme.fontFamily,
          background: content.coverImageUrl
            ? undefined
            : `linear-gradient(160deg, ${content.theme.accent}, ${content.theme.accentDark})`,
        }}
        className="relative overflow-hidden flex flex-col justify-end"
      >
        {content.coverImageUrl && (
          <>
            <img
              src={content.coverImageUrl}
              alt=""
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(to top, ${content.theme.accentDark} 5%, rgba(0,0,0,0) 55%)` }}
            />
          </>
        )}

        <img src="/Logo.png" alt="" className="absolute top-6 left-6 h-7 w-auto opacity-80" />

        <div className="relative px-6 pb-8 text-white">
          <h1 className="text-2xl font-bold leading-tight mb-2">{content.title}</h1>

          <div className="flex flex-col gap-1 mb-5 text-sm opacity-95">
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

          <div className="bg-white rounded-2xl p-3 flex items-center gap-3">
            <QRCodeSVG value={content.url} size={64} className="shrink-0 rounded" />
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--share-accent-dark)' }}>
                {content.ctaLabel}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">Escanea o abre el enlace</p>
            </div>
          </div>

          <p className="text-[10px] text-white/70 text-center mt-4">Creado con PaseLink</p>
        </div>
      </div>
    </div>
  )
}
