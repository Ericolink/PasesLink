import { Link } from 'react-router-dom'
import { LEGAL_DOCS, formatLegalDocDate } from '../legal/documents'

// Contenido separado del layout de página para poder reusarlo dentro de
// LegalDocumentSheet (el modal que se abre desde el registro) sin duplicar texto.
// Nota: pendiente de revisión legal — falta mencionar Cloudinary/EmailJS/Sentry
// como encargados de tratamiento (hoy solo se nombra Firebase).
export function PrivacyContent() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Política de privacidad</h1>
      <p className="text-sm text-gray-400 mb-8">Última actualización: {formatLegalDocDate(LEGAL_DOCS.privacy.version)}</p>

      <div className="space-y-6 text-sm text-gray-700">
        <section>
          <h2 className="font-medium text-gray-900 mb-1">1. Qué información recopilamos</h2>
          <p>
            Al usar PaseLink recopilamos: (a) datos de la cuenta del organizador (nombre, email, autenticado vía
            email/contraseña o Google), y (b) datos de los invitados que el organizador registra (nombre, email y
            teléfono opcionales, número de acompañantes, estado de confirmación y check-in).
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">2. Cómo usamos la información</h2>
          <p>
            Los datos se usan exclusivamente para operar el servicio: generar pases con QR, controlar el acceso al
            evento, mostrar reportes de asistencia al organizador y permitir que cada invitado consulte su propio
            pase mediante un enlace único.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">3. Con quién compartimos los datos</h2>
          <p>
            No vendemos ni compartimos datos de invitados con terceros. La información se almacena en Firebase
            (Google Cloud) y solo es accesible por el organizador del evento correspondiente y, con fines de soporte
            técnico, por el administrador de la plataforma.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">4. Acceso de los invitados a su pase</h2>
          <p>
            Cada invitado recibe un enlace único a su pase. Por seguridad, ese enlace queda asociado al primer
            dispositivo desde el que se abre. Si el organizador necesita reactivarlo, puede hacerlo desde el panel
            del evento.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">5. Eliminación de datos</h2>
          <p>
            El organizador puede eliminar invitados individuales o el evento completo (incluyendo todos sus
            invitados e historial de check-ins) en cualquier momento. Esta acción es permanente.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">6. Contacto</h2>
          <p>
            Para solicitudes relacionadas con tus datos personales, escríbenos a{' '}
            <a href="mailto:ericmunoz441@gmail.com" className="text-primary font-medium">
              ericmunoz441@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </>
  )
}

export function Privacy() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
      <PrivacyContent />
      <Link to="/" className="inline-block mt-8 text-sm text-primary font-medium">
        Volver al inicio
      </Link>
    </div>
  )
}
