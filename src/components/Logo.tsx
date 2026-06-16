export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-gray-900 dark:text-white ${className}`}>
      <svg viewBox="0 0 48 48" fill="none" className="w-7 h-7" aria-hidden="true">
        <rect width="48" height="48" rx="10" fill="#FF004D" />
        <rect x="9"  y="9"  width="10" height="10" rx="2" fill="#FAEF5D" />
        <rect x="29" y="9"  width="10" height="10" rx="2" fill="#fff" />
        <rect x="9"  y="29" width="10" height="10" rx="2" fill="#fff" />
        <rect x="29" y="29" width="4" height="4" rx="1" fill="#FAEF5D" />
        <rect x="35" y="29" width="4" height="4" rx="1" fill="#fff" />
        <rect x="29" y="35" width="4" height="4" rx="1" fill="#fff" />
        <rect x="35" y="35" width="4" height="4" rx="1" fill="#FAEF5D" />
      </svg>
      <span>
        Pase<span className="text-primary">Link</span>
      </span>
    </span>
  )
}
