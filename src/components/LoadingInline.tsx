export function LoadingInline({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  )
}
