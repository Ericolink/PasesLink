import type { ReactNode } from 'react'

// Estandariza el quiebre mobile/desktop que ya usaba AdminEventsTable.tsx
// (tarjetas en mobile, tabla desde `sm:`) — antes era la única tabla admin
// con vista mobile; AdminUsersTable/AdminReportsTable solo tenían
// overflow-x-auto (scroll horizontal de una tabla de varias columnas, difícil
// de leer en el celular). Un solo breakpoint compartido evita que las tres
// terminen divergiendo (`sm:hidden` vs `md:hidden` por descuido, etc.).
export function ResponsiveTable({ mobile, table }: { mobile: ReactNode; table: ReactNode }) {
  return (
    <>
      <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">{mobile}</div>
      <div className="hidden sm:block overflow-x-auto">{table}</div>
    </>
  )
}
