export function Logo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/Logo.png"
      alt="PaseLink"
      className={`h-9 w-auto logo-glow ${className}`}
    />
  )
}
