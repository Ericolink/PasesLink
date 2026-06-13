type IconProps = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconUsers({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function IconCheckCircle({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="M22 4 12 14.01l-3-3" />
    </svg>
  )
}

export function IconCheck({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function IconClock({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

export function IconHome({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M3 9.5 12 2l9 7.5" />
      <path d="M5 10v10h14V10" />
    </svg>
  )
}

export function IconThumbsUp({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0 4-7a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 1.94 2.5l-1.5 6A2 2 0 0 1 17 20H7" />
    </svg>
  )
}

export function IconThumbsDown({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3zm0 0-4 7a2 2 0 0 1-2-2v-4H5.5a2 2 0 0 1-1.94-2.5l1.5-6A2 2 0 0 1 7 4h10" />
    </svg>
  )
}

export function IconArrowLeft({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  )
}

export function IconStar({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  )
}

export function IconTicket({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M2 9a3 3 0 0 1 0 6v2a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a3 3 0 0 1 0-6V7a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z" />
      <path d="M13 5v2M13 11v2M13 17v2" />
    </svg>
  )
}

export function IconSun({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

export function IconMoon({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function IconInbox({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

export function IconCalendar({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

export function IconCake({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20 21v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7" />
      <path d="M4 21h16" />
      <path d="M12 14V8" />
      <path d="M9 8a1.5 1.5 0 0 1 0-3 1.5 1.5 0 0 1 1.5-1.5" />
      <path d="M12 8a1.5 1.5 0 0 0 0-3 1.5 1.5 0 0 0 1.5-1.5" />
      <path d="M7 14v-1a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1" />
    </svg>
  )
}

export function IconHeart({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

export function IconBuilding({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
    </svg>
  )
}

export function IconGift({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <rect x="3" y="8" width="18" height="13" rx="1" />
      <path d="M12 8v13M3 12h18" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  )
}

export function IconCamera({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

export function IconBarChart({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9M13 17v-5M8 17v-3" />
    </svg>
  )
}

export function IconAlertTriangle({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

export function IconXCircle({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <circle cx="12" cy="12" r="10" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  )
}

export function IconLogOut({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

export function IconCornerUpLeft({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M9 14 4 9l5-5" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  )
}

export function IconSparkles({ className = 'w-5 h-5' }: IconProps) {
  return (
    <svg className={className} {...base}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14z" />
    </svg>
  )
}
