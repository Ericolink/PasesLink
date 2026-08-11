// Clave de localStorage que EventJoin.tsx usa para recordar, en ESTE
// navegador, que la cuenta/dispositivo ya se autoregistró para un evento —
// evita re-mostrar el formulario y crear un segundo registro. Vive en su
// propio archivo (no en EventJoin.tsx) porque GuestPass.tsx también necesita
// limpiarla al cancelar la asistencia (ver handleCancelAttendance): sin la
// limpieza, este mismo navegador quedaba atrapado mandando siempre al pase ya
// borrado en vez de dejar volver a registrarse (bug reportado 2026-08-10).
// `react-refresh/only-export-components` no permite exportar funciones sueltas
// desde un archivo de página, de ahí que no viva junto al componente.
export function regKey(eventId: string) {
  return `join_reg_${eventId}`
}
