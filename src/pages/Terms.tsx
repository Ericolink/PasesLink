import { Link } from 'react-router-dom'

export function Terms() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Términos y condiciones</h1>
      <p className="text-sm text-gray-400 mb-8">Última actualización: junio de 2026</p>

      <div className="space-y-6 text-sm text-gray-700">
        <section>
          <h2 className="font-medium text-gray-900 mb-1">1. Descripción del servicio</h2>
          <p>
            PaseLink es una plataforma que permite a organizadores crear eventos, gestionar invitados, generar pases
            con código QR y registrar el ingreso/salida de asistentes. El servicio se ofrece "tal cual", actualmente
            en fase beta.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">2. Cuentas y responsabilidad del organizador</h2>
          <p>
            El organizador es responsable de la información que registra sobre sus invitados (nombres, correos,
            teléfonos) y debe contar con su consentimiento para almacenarla y compartirles los enlaces de invitación
            generados por la plataforma.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">3. Planes y pagos</h2>
          <p>
            PaseLink ofrece un plan Básico y un plan Premium con funciones adicionales. Los precios y funciones de
            cada plan pueden actualizarse; cualquier cambio se reflejará en la página de creación de eventos.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">4. Disponibilidad del servicio</h2>
          <p>
            Al estar en fase beta, el servicio puede presentar interrupciones, cambios o ajustes sin previo aviso.
            Recomendamos exportar respaldos (PDF/CSV) de información importante antes de eventos críticos.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">5. Eliminación de cuentas y datos</h2>
          <p>
            El organizador puede eliminar sus eventos en cualquier momento desde el panel del evento. Esta acción
            borra permanentemente los invitados y el historial de check-ins asociados.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">6. Contacto</h2>
          <p>
            Para preguntas sobre estos términos, escríbenos a{' '}
            <a href="mailto:ericmunoz441@gmail.com" className="text-primary font-medium">
              ericmunoz441@gmail.com
            </a>
            .
          </p>
        </section>
      </div>

      <Link to="/" className="inline-block mt-8 text-sm text-primary font-medium">
        Volver al inicio
      </Link>
    </div>
  )
}
