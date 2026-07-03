import { IconCalendar, IconClock } from './Icons'

interface Props {
  date: string
  onDateChange: (value: string) => void
  startTime: string
  onStartTimeChange: (value: string) => void
  endTime: string
  onEndTimeChange: (value: string) => void
  dateId?: string
  startTimeId?: string
  endTimeId?: string
}

// Mismo tamaño de fuente/tipografía que el resto de los inputs de la app —
// `[color-scheme:light] dark:[color-scheme:dark]` es lo que hace que el
// selector nativo del navegador (calendario/reloj) y su ícono se dibujen en
// la paleta correcta en cada modo; sin esto el ícono nativo se ve oscuro
// sobre fondo oscuro (casi invisible). El fondo queda transparente a
// propósito: lo pinta el contenedor de la fila (ver `wrapperClass`), nunca
// el input — así los tres campos se ven como una sola superficie, no tres
// cajas independientes.
const inputClass =
  'w-full bg-transparent border-0 p-0 text-sm font-medium text-gray-900 dark:text-white focus:outline-none [color-scheme:light] dark:[color-scheme:dark]'
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-0.5'
// focus-within (no focus: en el input) porque el anillo de foco vive en la
// fila completa, no en el control nativo — visible con teclado (Tab) y con
// mouse por igual, sin el outline default del navegador duplicado adentro.
const rowClass = 'relative flex items-center gap-2.5 px-3 py-2.5 min-w-0 focus-within:z-10 focus-within:ring-2 focus-within:ring-primary focus-within:ring-inset transition-shadow'
// bg-white/border-black/10 explícitos (no `dark:bg-gray-800` ni
// `dark:border-gray-600`): esta app remapea gray-300..900 en modo oscuro
// para que sirvan de TEXTO legible (ver index.css, ".dark { --color-gray-800:
// #E9E5EF ... }" — casi blanco), no para fondos/bordes de superficie. Usar
// esos tokens acá pintaría el bloque casi blanco con texto blanco encima —
// exactamente el bug de contraste que se está arreglando. white/black con
// alpha son inmunes a ese remapeo: siempre leen como "superficie clara" o
// "superficie oscura" sin importar el tema.
const wrapperClass = 'rounded-lg border border-black/15 dark:border-white/15 divide-y divide-black/10 dark:divide-white/15 overflow-hidden bg-white dark:bg-white/[0.04]'
const dividerClass = 'grid grid-cols-2 divide-x divide-black/10 dark:divide-white/15'

// Selector de fecha + hora — un solo bloque visual (borde/radio compartido,
// filas separadas por hairlines) sobre inputs NATIVOS de verdad
// (<input type="date">/"time">), no un calendario propio: los controles
// nativos ya son accesibles (teclado, lector de pantalla, formato de fecha
// según el idioma del sistema) y consistentes con el resto del navegador —
// lo único propio acá es el contenedor que los agrupa y les da identidad.
export function EventScheduleField({
  date,
  onDateChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  dateId = 'event-date',
  startTimeId = 'event-start-time',
  endTimeId = 'event-end-time',
}: Props) {
  return (
    <div className={wrapperClass}>
      <div className={rowClass}>
        <IconCalendar className="w-4 h-4 text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <label htmlFor={dateId} className={labelClass}>Fecha</label>
          <input id={dateId} type="date" required value={date} onChange={(e) => onDateChange(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className={dividerClass}>
        <div className={rowClass}>
          <IconClock className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <label htmlFor={startTimeId} className={labelClass}>
              Inicio <span className="normal-case font-normal">(opc.)</span>
            </label>
            <input id={startTimeId} type="time" value={startTime} onChange={(e) => onStartTimeChange(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className={rowClass}>
          <IconClock className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <label htmlFor={endTimeId} className={labelClass}>
              Fin <span className="normal-case font-normal">(opc.)</span>
            </label>
            <input id={endTimeId} type="time" value={endTime} onChange={(e) => onEndTimeChange(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>
    </div>
  )
}
