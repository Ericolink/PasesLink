import { useState } from 'react'
import type { ScanFeedback } from '../pages/Scanner'
import { IconAlertTriangle, IconBan, IconCheck, IconCheckCircle, IconCopy, IconHelpCircle, IconLogOut, IconUsers, IconX, IconXCircle } from './Icons'
import { useModalA11y } from '../hooks/useModalA11y'
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods'
import type { PaymentMethod } from '../types'

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ScanResultModal({
  feedback,
  onClose,
  onInteract,
  onRequestCheckout,
  onConfirmPayment,
  confirmingPayment,
  confirmError,
  paymentMethods,
  onSelectPaymentMethod,
}: {
  feedback: ScanFeedback
  onClose: () => void
  // Se dispara al primer toque/foco/hover sobre el diálogo — el padre lo usa
  // para pausar el auto-cierre (ver AUTO_CLOSE_MS en Scanner.tsx): alguien
  // que está leyendo el resultado con más tiempo no debería competir contra
  // un timer mientras lo hace.
  onInteract?: () => void
  onRequestCheckout?: () => void
  onConfirmPayment?: () => void
  confirmingPayment?: boolean
  confirmError?: string | null
  // Métodos configurados para el evento — el selector solo se muestra si hay
  // más de uno (con un solo método no hay nada que elegir). El invitado
  // puede ya traer uno preseleccionado (feedback.paymentMethod, ver
  // Scanner.tsx) si mandó comprobante; el guardia puede cambiarlo antes de
  // confirmar (ej. paga en efectivo en la puerta en vez de transferencia).
  paymentMethods?: PaymentMethod[]
  onSelectPaymentMethod?: (method: PaymentMethod) => void
}) {
  const [showFirstCheckIn, setShowFirstCheckIn] = useState(false)

  // bg-success/bg-error/bg-warning (Design Memory: "verde=válido,
  // rojo=usado/duplicado") en vez de los verdes/rojos/ámbares sueltos de
  // Tailwind — success ya coincidía en valor (green-600 = #16a34a), así
  // que pasa a el token sin cambio visual. error/warning si cambian en
  // claro (rojo/ámbar más suaves de marca); en oscuro quedan iguales a
  // como estaban (--color-error/--color-warning se congelaron ahí). Los
  // rojos "700" (denegado/bloqueado) se dejan sueltos a propósito: son un
  // matiz más severo que el error base, distinción que Design Memory no
  // define pero que la app ya usaba para diferenciar "duplicado" de
  // "denegado".
  const styles = {
    success: { bg: 'bg-success', icon: IconCheckCircle, title: 'Bienvenido/a' },
    already: { bg: 'bg-error', icon: IconCopy, title: 'QR ya registrado' },
    invalid: { bg: 'bg-error', icon: IconXCircle, title: 'No válido' },
    // No entra en AUTO_CLOSE_TYPES (ver Scanner.tsx) a propósito: el pago
    // pendiente exige una decisión consciente del guardia (negar el acceso),
    // no debe desaparecer solo mientras lo está leyendo.
    payment_required: { bg: 'bg-red-700', icon: IconBan, title: 'Acceso denegado — no pagó' },
    checkout: { bg: 'bg-blue-600', icon: IconLogOut, title: 'Hasta luego' },
    already_out: { bg: 'bg-warning', icon: IconAlertTriangle, title: 'Ya había salido' },
    not_checked_in: { bg: 'bg-warning', icon: IconAlertTriangle, title: 'Sin check-in' },
    exit_blocked: { bg: 'bg-red-700', icon: IconBan, title: 'Reingreso no permitido' },
    full: { bg: 'bg-orange-500', icon: IconUsers, title: 'Cupo lleno' },
    not_found: { bg: 'bg-gray-600', icon: IconHelpCircle, title: 'No encontrado' },
    error: { bg: 'bg-red-700', icon: IconAlertTriangle, title: 'Error' },
  }[feedback.type]

  const Icon = styles.icon
  // El padre monta/desmonta este componente (`{feedback && <ScanResultModal .../>}`)
  // en vez de un flag `open` interno — el montaje ya equivale a "abierto".
  const dialogRef = useModalA11y<HTMLDivElement>(true, onClose)
  // aria-label incluye guestName/detail (no solo el título) — es el payload
  // que realmente importa ("Bienvenido/a" solo no dice de quién se trata) y
  // un lector de pantalla anuncia el nombre accesible completo al enfocar el
  // diálogo, sin depender de que el usuario explore el contenido a mano.
  const accessibleLabel = [styles.title, feedback.guestName, feedback.detail].filter(Boolean).join(' — ')

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-[env(safe-area-inset-bottom)] sm:pb-0" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={accessibleLabel}
        className={`${styles.bg} text-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-sm w-full p-8 text-center animate-bounce-in`}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onInteract}
        onTouchStart={onInteract}
        // No se usa onFocus: useModalA11y ya mueve el foco al primer control
        // del diálogo al montar (ver ahí), y ese foco inicial programático
        // burbujearía como un focus "de interacción" acá, pausando el
        // auto-cierre en TODOS los resultados en vez de solo cuando alguien
        // realmente lo necesita. Tab sí es inequívocamente una acción del
        // usuario (el foco inicial no dispara keydown).
        onKeyDown={(e) => { if (e.key === 'Tab') onInteract?.() }}
      >
        <Icon className="w-14 h-14 mb-3 mx-auto" />
        <h2 className="text-2xl font-semibold mb-2">{styles.title}</h2>
        {feedback.guestName && <p className="text-lg mb-1">{feedback.guestName}</p>}
        {feedback.detail && <p className="text-sm opacity-90">{feedback.detail}</p>}

        {feedback.type === 'already' && feedback.checkedInAt != null && (
          <div className="mt-3">
            {!showFirstCheckIn ? (
              <button
                onClick={() => setShowFirstCheckIn(true)}
                className="text-sm underline opacity-90 hover:opacity-100"
              >
                Ver primer check-in
              </button>
            ) : (
              <p className="text-sm opacity-90">
                Registrado el {formatTimestamp(feedback.checkedInAt)}
                {feedback.checkedInByEmail ? ` por ${feedback.checkedInByEmail}` : ''}
              </p>
            )}
          </div>
        )}

        {feedback.type === 'already' && onRequestCheckout && (
          <button
            onClick={onRequestCheckout}
            className="mt-4 inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-4 py-3 text-sm font-medium w-full justify-center"
          >
            <IconLogOut className="w-4 h-4" />
            ¿Salió del evento?
          </button>
        )}

        {feedback.type === 'payment_required' && confirmError && (
          <p className="mt-3 text-sm font-medium text-white bg-black/20 rounded-md px-3 py-2">{confirmError}</p>
        )}

        {feedback.type === 'payment_required' && onConfirmPayment && paymentMethods && paymentMethods.length > 1 && (
          <div className="mt-4">
            <p className="text-xs opacity-75 mb-1.5">Método de pago</p>
            <div className="flex gap-2">
              {paymentMethods.map((method) => {
                // Sin selección propia (invitado que nunca mandó
                // comprobante), el primer método configurado se ve
                // seleccionado — es el mismo fallback que usa
                // handleConfirmPayment en Scanner.tsx si el guardia
                // confirma sin tocar este selector.
                const isSelected = (feedback.paymentMethod ?? paymentMethods[0]) === method
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => onSelectPaymentMethod?.(method)}
                    disabled={confirmingPayment}
                    aria-pressed={isSelected}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                      isSelected ? 'bg-white text-red-700' : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[method]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {feedback.type === 'payment_required' ? (
          // Orden y prominencia invertidos a propósito: el encabezado de
          // esta tarjeta ya dice "Acceso denegado" — la acción que CONFIRMA
          // ese veredicto (no pagó) va primero y con el estilo sólido/alto
          // contraste; "Sí, ya pagó" es la excepción que requiere criterio
          // del guardia (verificó el pago por otro medio) y queda segunda,
          // con menos peso visual, para reducir el riesgo de tocarla por
          // reflejo bajo presión en la puerta. "No, aún no pagó" se muestra
          // siempre (equivale a cerrar el modal, no requiere confirmPayments)
          // — antes, si el guardia no tenía ese permiso, esta tarjeta perdía
          // TAMBIÉN el botón de rechazo explícito y colapsaba a un genérico
          // "Cerrar", como si no hubiera ninguna decisión que tomar.
          <div className="flex flex-col gap-2.5 mt-6">
            <button
              onClick={onClose}
              disabled={confirmingPayment}
              className="min-h-14 inline-flex items-center justify-center gap-2 bg-white text-red-700 hover:opacity-90 transition-opacity rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-50"
            >
              <IconX className="w-4 h-4" />
              No, aún no pagó
            </button>
            {onConfirmPayment && (
              <button
                onClick={onConfirmPayment}
                disabled={confirmingPayment}
                className="min-h-14 inline-flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                <IconCheck className="w-4 h-4" />
                {confirmingPayment ? 'Confirmando…' : 'Sí, ya pagó'}
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={onClose}
            className="mt-6 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-4 py-3 text-sm font-medium w-full"
          >
            Cerrar
          </button>
        )}
      </div>
    </div>
  )
}
