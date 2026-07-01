// Genera una tarjeta estilo "wallet pass" como imagen PNG descargable.
// Se dibuja directamente sobre un canvas — sin html2canvas, sin dependencias extra.

import type { EventData } from '../types'
import type { GuestData } from '../types'
import { formatDate } from './time'

interface WalletCardOptions {
  event: EventData
  guest: GuestData
  qrCanvas: HTMLCanvasElement | null
  accentColor?: string
}

const W = 800
const H = 480
const RADIUS = 24
const ACCENT_H = 8

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function formatTime(t?: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`
}

export async function downloadWalletCard({ event, guest, qrCanvas, accentColor }: WalletCardOptions): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = W * 2  // retina
  canvas.height = H * 2
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`

  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)

  const accent = accentColor || '#FF1464'

  // ── Background ──
  roundRect(ctx, 0, 0, W, H, RADIUS)
  ctx.fillStyle = '#1a1025'
  ctx.fill()

  // ── Accent top bar ──
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, W, ACCENT_H + RADIUS)
  ctx.fillRect(0, 0, W, ACCENT_H)

  // ── Subtle gradient overlay ──
  const grad = ctx.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, 'rgba(255,255,255,0.04)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  roundRect(ctx, 0, 0, W, H, RADIUS)
  ctx.fillStyle = grad
  ctx.fill()

  // ── Perforated divider ──
  const divX = W * 0.62
  ctx.save()
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(divX, 32)
  ctx.lineTo(divX, H - 32)
  ctx.stroke()
  ctx.restore()

  // Circle notches on divider
  for (const y of [0, H]) {
    ctx.beginPath()
    ctx.arc(divX, y, 12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(10,5,20,1)'
    ctx.fill()
  }

  // ── LEFT SECTION: Event info ──
  const left = 40
  const topY = 48

  // Event name
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.textBaseline = 'top'
  // Truncate long names
  const maxNameW = divX - left - 20
  let eventName = event.name
  while (ctx.measureText(eventName).width > maxNameW && eventName.length > 3) {
    eventName = eventName.slice(0, -1)
  }
  if (eventName !== event.name) eventName += '…'
  ctx.fillText(eventName, left, topY)

  // Accent underline
  ctx.fillStyle = accent
  ctx.fillRect(left, topY + 36, 40, 3)

  // Date
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText('FECHA', left, topY + 54)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const dateStr = formatDate(event.date)
  ctx.fillText(dateStr.charAt(0).toUpperCase() + dateStr.slice(1), left, topY + 70)

  // Time
  if (event.startTime) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText('HORA', left, topY + 104)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    const timeStr = formatTime(event.startTime) + (event.endTime ? ` – ${formatTime(event.endTime)}` : '')
    ctx.fillText(timeStr, left, topY + 120)
  }

  // Location
  const locY = event.startTime ? topY + 158 : topY + 104
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText('LUGAR', left, locY)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  let loc = event.location
  while (ctx.measureText(loc).width > maxNameW && loc.length > 3) {
    loc = loc.slice(0, -1)
  }
  if (loc !== event.location) loc += '…'
  ctx.fillText(loc, left, locY + 16)

  // Dress code
  if (event.dressCode) {
    const dcY = locY + 54
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText('VESTIMENTA', left, dcY)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText(event.dressCode, left, dcY + 16)
  }

  // PaseLink branding (bottom-left)
  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText('PaseLink', left, H - 24)

  // ── RIGHT SECTION: Guest + QR ──
  const right = divX + 28
  const rightW = W - right - 24

  // Guest label
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.fillText('INVITADO', right, topY)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  let guestName = guest.name
  while (ctx.measureText(guestName).width > rightW && guestName.length > 3) {
    guestName = guestName.slice(0, -1)
  }
  if (guestName !== guest.name) guestName += '…'
  ctx.fillText(guestName, right, topY + 16)

  if (guest.companions.length > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.fillText(`+ ${guest.companions.length} acompañante(s)`, right, topY + 42)
  }

  // QR code
  const qrSize = Math.min(rightW, 160)
  const qrX = right + (rightW - qrSize) / 2
  const qrY = topY + 64

  if (qrCanvas) {
    // White background for QR
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 8)
    ctx.fill()
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize)
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    roundRect(ctx, qrX, qrY, qrSize, qrSize, 8)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('QR', qrX + qrSize / 2, qrY + qrSize / 2)
    ctx.textAlign = 'left'
  }

  // "Escanea en la entrada" label
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Escanea en la entrada', right + rightW / 2, qrY + qrSize + 20)
  ctx.textAlign = 'left'

  // ── Download ──
  const dataUrl = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `pase-${guest.name.replace(/\s+/g, '_').slice(0, 30)}.png`
  a.click()
}
