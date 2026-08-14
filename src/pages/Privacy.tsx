import { Link } from 'react-router-dom'
import { LEGAL_DOCS, formatLegalDocDate } from '../legal/documents'
import { useSeoMeta } from '../hooks/useSeoMeta'

// Contenido separado del layout de página para poder reusarlo dentro de
// LegalDocumentSheet (el modal que se abre desde el registro) sin duplicar texto.
// Nota: pendiente de revisión legal — falta mencionar Cloudinary/Brevo/Sentry
// como encargados de tratamiento (hoy solo se nombra Firebase).
export function PrivacyContent() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Política de privacidad</h1>
      <p className="text-sm text-gray-500 mb-8">Última actualización: {formatLegalDocDate(LEGAL_DOCS.privacy.version)}</p>

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
          <h2 className="font-medium text-gray-900 mb-1">4. Publicidad y cookies de terceros</h2>
          <p>
            En algunas páginas públicas de PaseLink (la página de inicio y la invitación pública de un evento) puede
            mostrarse publicidad a través de Google AdSense. Cuando eso ocurre, tu navegador se comunica
            directamente con Google, que puede usar cookies u otros identificadores del dispositivo para mostrar
            anuncios relevantes y medir su rendimiento. Esta publicidad nunca aparece en el pase con código QR, en el
            formulario de confirmación de asistencia, en el registro de pago ni en ninguna pantalla del panel del
            organizador (invitados, reportes, caja, configuración).
          </p>
          <p className="mt-2">
            PaseLink no le entrega a Google los datos de tus invitados (nombre, teléfono, email, código QR ni
            comprobantes de pago); la relación entre tu navegador y Google al mostrar un anuncio es directa y se rige
            por las políticas de privacidad de Google. Si visitas PaseLink desde la Unión Europea, el Reino Unido o
            Suiza, puede aparecer un aviso de consentimiento de Google antes de mostrarte publicidad personalizada;
            ese aviso nunca bloquea el acceso a tu invitación, tu pase o tu confirmación de asistencia. Puedes
            revisar cómo Google usa esta información en su{' '}
            <a
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium"
            >
              política de tecnologías de publicidad
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">5. Acceso de los invitados a su pase</h2>
          <p>
            Cada invitado recibe un enlace único y personal a su pase, que puede abrir desde cualquier dispositivo.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">6. Eliminación de datos</h2>
          <p>
            El organizador puede eliminar invitados individuales o el evento completo (incluyendo todos sus
            invitados e historial de check-ins) en cualquier momento. Esta acción es permanente.
          </p>
        </section>

        <section>
          <h2 className="font-medium text-gray-900 mb-1">7. Contacto</h2>
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
  useSeoMeta({
    title: 'Política de privacidad',
    description: 'Política de privacidad de PaseLink: qué datos recopilamos de organizadores e invitados y cómo los usamos.',
    path: '/privacidad',
  })
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
      <PrivacyContent />
      <Link to="/" className="inline-block mt-8 text-sm text-primary font-medium">
        Volver al inicio
      </Link>
    </div>
  )
}
