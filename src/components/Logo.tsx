export function Logo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/Logo.png"
      alt="PaseLink"
      className={`h-30 w-auto ${className}`}
    />
  )
}
