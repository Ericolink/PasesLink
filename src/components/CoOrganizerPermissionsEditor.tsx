import type { CoOrganizerPermissions } from '../types/coOrganizerPermissions'

type PermissionKey = keyof CoOrganizerPermissions

interface Group {
  title: string
  items: { key: PermissionKey; label: string }[]
}

// Agrupado por área en vez de una lista plana de 14 checkboxes — más fácil
// de escanear de un vistazo qué puede y qué no puede hacer cada persona.
// Agregar un permiso nuevo: sumarlo al grupo que corresponda, nada más (el
// resto del componente ya itera sobre esto).
const GROUPS: Group[] = [
  {
    title: 'Invitados',
    items: [
      { key: 'addGuests', label: 'Agregar invitados' },
      { key: 'editGuests', label: 'Editar invitados' },
      { key: 'deleteGuests', label: 'Eliminar invitados' },
      { key: 'viewGuestList', label: 'Ver lista completa de invitados' },
    ],
  },
  {
    title: 'Acceso y pagos',
    items: [
      { key: 'scanQr', label: 'Escanear QR en el acceso' },
      { key: 'confirmPayments', label: 'Confirmar pagos' },
      { key: 'shareInviteLink', label: 'Compartir enlace de autoregistro' },
    ],
  },
  {
    title: 'Muro del evento',
    items: [
      { key: 'postWall', label: 'Publicar en el muro' },
      { key: 'moderateWall', label: 'Moderar el muro' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { key: 'editEvent', label: 'Editar información del evento' },
      { key: 'manageCoOrganizers', label: 'Administrar coanfitriones' },
      { key: 'viewReports', label: 'Ver reportes' },
      { key: 'exportLists', label: 'Exportar listas' },
      { key: 'downloadEventInfo', label: 'Descargar información del evento' },
    ],
  },
]

export function CoOrganizerPermissionsEditor({
  value,
  onChange,
}: {
  value: CoOrganizerPermissions
  onChange: (next: CoOrganizerPermissions) => void
}) {
  function toggle(key: PermissionKey) {
    onChange({ ...value, [key]: !value[key] })
  }

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => (
        <div key={group.title}>
          <h4 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
            {group.title}
          </h4>
          <div className="space-y-1">
            {group.items.map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-2.5 py-1 cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  checked={value[item.key]}
                  onChange={() => toggle(item.key)}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-offset-0"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
