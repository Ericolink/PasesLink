import { Link } from 'react-router-dom'
import { useSeoMeta } from '../hooks/useSeoMeta'
import { LegalPageLayout, LegalSection } from '../components/legal/LegalPageLayout'
import { PRIVACY_SECTIONS } from '../legal/sections'

// Contenido separado del layout de página para poder reusarlo dentro de
// LegalDocumentSheet (el modal que se abre desde el registro) sin duplicar
// texto — ver la misma nota en Terms.tsx.
//
// Redactado a partir de la auditoría técnica de PaseLink (2026-08-15): cada
// proveedor, colección de datos y comportamiento descrito aquí corresponde a
// lo verificado en el código real, no a una plantilla genérica. Se evitó
// deliberadamente afirmar cumplimiento de leyes/regulaciones específicas.
//
// NOTA INTERNA — REVISIÓN LEGAL RECOMENDADA antes de publicar como versión
// definitiva: jurisdicción y legislación aplicable (§16), derechos del
// usuario según país (§13), transferencias internacionales de datos (§14),
// consentimiento/cookies de publicidad (§9), protección de menores (§12),
// y tratamiento de datos de terceros/acompañantes (§4). Este documento no es
// asesoría legal ni garantiza cumplimiento de ninguna ley o regulación.
export function PrivacyContent() {
  return (
    <>
      <LegalSection id="que-recopilamos" title="1. Qué información recopilamos">
        <p><strong>De tu cuenta</strong> (si te registras como organizador o invitado): nombre, correo, cómo iniciaste sesión (correo/contraseña o Google), y una foto de perfil si eliges subir una.</p>
        <p><strong>Del evento</strong> (si eres organizador): nombre, fecha, hora, ubicación, descripción, imagen de portada, configuración de cupo y pago, y cualquier información adicional que decidas agregar (preguntas frecuentes, transporte, menú, regalos, campos personalizados para tus invitados).</p>
        <p><strong>De los invitados</strong> (la que el organizador recopila, o la que el propio invitado escribe al autorregistrarse): nombre, apellido, teléfono y correo opcionales, respuestas a los campos que pida el organizador, estado de confirmación de asistencia, estado de pago, y estado de check-in.</p>
        <p><strong>De los pagos:</strong> el método elegido (transferencia o efectivo), el estado del pago (pendiente/confirmado) y, si el invitado lo escribe, una nota de texto con una referencia de pago. <strong>No recopilamos ni almacenamos datos de tarjetas.</strong></p>
        <p><strong>De ventas dentro del evento</strong> (si el organizador activa esa función): qué productos pidió el invitado, cantidades, monto total y estado del pedido.</p>
        <p><strong>De la lista de espera</strong> (si el evento está lleno): nombre, tamaño del grupo y datos de contacto opcionales.</p>
      </LegalSection>

      <LegalSection id="como-usamos" title="2. Cómo usamos la información">
        <p>
          Usamos los datos exclusivamente para operar el servicio: generar pases con código QR, controlar el
          acceso al evento, mostrar reportes de asistencia al organizador, gestionar pagos declarados, ventas
          dentro del evento y lista de espera, permitir que cada invitado consulte su propio pase, enviar
          comunicaciones necesarias sobre tu registro o tu evento, y medir el uso de la plataforma para mejorarla
          (ver "Analítica").
        </p>
      </LegalSection>

      <LegalSection id="modelo-enlaces" title="3. Cómo funcionan los enlaces de PaseLink">
        <p>
          Es importante que entiendas cómo PaseLink protege — y qué tan lejos protege — la información de un
          evento. En lugar de exigir siempre una cuenta, PaseLink usa <strong>enlaces</strong>: quien tiene el
          enlace correcto puede ver la información asociada a él, sin necesidad de iniciar sesión.
        </p>
        <p>Concretamente:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>El evento es visible con su enlace.</strong> Cualquiera que tenga el enlace de un evento puede
            ver su información pública: nombre, fecha, hora, lugar, descripción, imagen, y — si el organizador la
            configuró — las instrucciones de pago, el teléfono de contacto del organizador, el menú de venta, y
            secciones como preguntas frecuentes o transporte.
          </li>
          <li>
            <strong>El muro y las historias del evento también son visibles con el enlace</strong>, sin necesidad
            de estar en la lista de invitados.
          </li>
          <li>
            <strong>El pase de un invitado usa su propio enlace/token individual.</strong> Cualquiera que reciba
            ese enlace en particular puede ver el nombre del invitado, su código QR y su estado de asistencia/pago
            — igual que sucede con una entrada física o un boleto: quien lo tiene, lo puede usar. Por eso te
            recomendamos no compartir el enlace de tu propio pase con nadie.
          </li>
        </ul>
        <p>
          <strong>La lista completa de invitados de un evento no es públicamente enumerable</strong> — nadie puede
          "listar" o buscar a todos los invitados de un evento sin ser el organizador o un colaborador con permiso
          para verla. Tampoco es posible encontrar el pase de alguien sin conocer su enlace específico.
        </p>
        <p>
          En resumen: no describimos como "privado" algo que técnicamente es accesible con un enlace. Si compartes
          el enlace de un evento o de un pase, estás compartiendo la información visible en él.
        </p>
      </LegalSection>

      <LegalSection id="acompanantes" title="4. Datos de acompañantes y otros terceros">
        <p>
          Un invitado puede registrar acompañantes (por ejemplo, su pareja o su familia) al confirmar su asistencia.
          Si haces esto, debes contar con la autorización de esas personas para compartir su nombre y, si aplica,
          su teléfono con el organizador del evento a través de PaseLink.
        </p>
        <p>
          <strong>Hallazgo importante de nuestra propia auditoría técnica, que no queremos ocultar:</strong> hoy, el
          teléfono de un acompañante se guarda junto con el resto de la información del pase, que es visible para
          cualquiera que tenga el enlace de ese pase — a diferencia del teléfono del invitado principal, que vive
          en un lugar con un control de acceso más estricto (no es listable ni buscable por el organizador sin
          permiso). En la práctica, esto significa que el teléfono de un acompañante puede quedar un poco más
          expuesto que el del invitado que lo registró. Estamos evaluando ajustar esto técnicamente; mientras
          tanto, preferimos que lo sepas con precisión en vez de describir ambos datos como igualmente protegidos.
        </p>
      </LegalSection>

      <LegalSection id="proveedores" title="5. Con quién compartimos datos">
        <p>
          No vendemos los datos de nuestros usuarios. Para poder operar PaseLink, usamos los siguientes proveedores,
          que procesan datos en nuestro nombre según su rol:
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Firebase / Google Cloud</strong> — autenticación de cuentas, base de datos, funciones de servidor y notificaciones push. Es nuestra infraestructura principal; prácticamente todos los datos descritos en esta política pasan por aquí.</li>
          <li><strong>Cloudinary</strong> — almacena las imágenes que subes (foto de perfil, portada del evento, fotos del muro, fotos de productos de venta).</li>
          <li><strong>Brevo</strong> — envía los correos necesarios del servicio: bienvenida al registrarte, tu pase al autorregistrarte, recordatorios de confirmación de asistencia, y aviso de oferta de lugar en lista de espera.</li>
          <li><strong>Sentry</strong> — ver sección dedicada más abajo.</li>
          <li><strong>OpenRouteService</strong> — calcula la hora recomendada de salida hacia tu evento (tráfico y ruta), usando la ubicación del evento (no tu ubicación personal, salvo que tu navegador la comparta para ese cálculo).</li>
          <li><strong>Open-Meteo</strong> — pronóstico del clima del evento. No requiere ni recibe datos personales.</li>
          <li><strong>Cloudflare</strong> — nuestro dominio está detrás de la infraestructura de Cloudflare (típico de cualquier proveedor de DNS/CDN), que puede recopilar métricas técnicas básicas de las solicitudes. No integramos ningún servicio propio de Cloudflare dentro de la app.</li>
        </ul>
        <p>Además, dos funciones están construidas pero su activación en producción puede variar con el tiempo:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>WhatsApp Business API (Meta)</strong> — si está activa, se usa únicamente para notificarte por WhatsApp si se libera un lugar de lista de espera, y solo si tú mismo diste tu teléfono y tu consentimiento en un formulario de autorregistro (nunca si un organizador te agregó manualmente). Si no está disponible o no diste tu consentimiento, la notificación se envía por correo en su lugar.</li>
          <li><strong>Google AdSense</strong> — ver sección "Publicidad" más abajo.</li>
        </ul>
      </LegalSection>

      <LegalSection id="analitica" title="6. Analítica (Firebase Analytics / Google Analytics)">
        <p>
          Usamos Firebase Analytics (basado en Google Analytics) para entender cómo se usa PaseLink y mejorar el
          producto: qué pantallas se visitan, si se crea/edita un evento, si se confirma una asistencia, si se
          completa un check-in, entre otros eventos de uso similares.
        </p>
        <p>
          Diseñamos esta analítica para evitar deliberadamente enviar datos personales identificables: nunca
          incluimos tu nombre, correo, teléfono, código QR ni los tokens de tus enlaces. Las rutas dinámicas de la
          aplicación (por ejemplo, la URL de un pase específico) se anonimizan antes de registrarse como una
          vista de pantalla, precisamente para que ese tipo de identificador nunca llegue a Analytics.
        </p>
      </LegalSection>

      <LegalSection id="sentry" title="7. Monitoreo de errores (Sentry)">
        <p>
          Usamos Sentry para detectar errores, medir el rendimiento de la aplicación y hacer diagnóstico técnico
          cuando algo falla. Antes de enviar información a Sentry, aplicamos un filtro que reemplaza cualquier dato
          que parezca un correo o un teléfono. Aun así, si tienes una sesión iniciada, tu identificador de usuario y
          tu correo pueden asociarse a un error específico para poder investigarlo — no ofrecemos una anonimización
          absoluta de esta herramienta.
        </p>
      </LegalSection>

      <LegalSection id="publicidad" title="8. Publicidad">
        <p>
          PaseLink tiene integrado Google AdSense para mostrar publicidad en la página de inicio y en la invitación
          pública de un evento — nunca en tu pase, en el formulario de confirmación de asistencia, en el registro
          de pago, ni en ninguna pantalla del panel del organizador. Esta función puede estar activa o desactivada
          según el momento; si está desactivada, no verás ningún anuncio.
        </p>
        <p>
          Cuando la publicidad está activa, tu navegador se comunica directamente con Google, que puede usar
          cookies u otros identificadores del dispositivo para mostrar anuncios y medir su rendimiento. No le
          entregamos a Google los datos de tus invitados (nombre, teléfono, correo, código QR ni comprobantes de
          pago) — esa relación entre tu navegador y Google es directa y se rige por las políticas de privacidad de
          Google. Si visitas PaseLink desde la Unión Europea, el Reino Unido o Suiza, puede aparecer un aviso de
          consentimiento de Google antes de mostrarte publicidad personalizada; ese aviso nunca bloquea el acceso a
          tu invitación, tu pase o tu confirmación de asistencia. Puedes revisar cómo Google usa esta información en
          su{' '}
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
      </LegalSection>

      <LegalSection id="cookies" title="9. Cookies y almacenamiento local">
        <p>
          PaseLink no usa cookies propias. Las cookies que puedas ver provienen de terceros (Google, cuando la
          publicidad o la analítica están activas). Sí usamos almacenamiento técnico en tu navegador
          (localStorage/sessionStorage) para funciones como recordar tu tema claro/oscuro, evitar registros
          duplicados, o mantener tu sesión — el detalle completo, con cada dato que guardamos y para qué, está en
          nuestro{' '}
          <Link to="/cookies" className="text-primary font-medium">
            Aviso de Cookies
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection id="notificaciones" title="10. Notificaciones">
        <p>
          Enviamos comunicaciones necesarias para el funcionamiento del servicio: correo de bienvenida al
          registrarte, tu pase al autorregistrarte a un evento, recordatorios de confirmación de asistencia, y
          aviso de oferta de lugar en lista de espera (por WhatsApp o correo, según tu consentimiento). Si eres
          organizador o colaborador, puedes además activar notificaciones push en tu dispositivo (por ejemplo,
          cuando se confirma un pago o llega una nueva confirmación de asistencia) — puedes desactivarlas en
          cualquier momento desde tu perfil, sin afectar otros dispositivos donde las tengas activas.
        </p>
        <p>Actualmente no enviamos comunicaciones promocionales o de marketing.</p>
      </LegalSection>

      <LegalSection id="seguridad" title="11. Seguridad">
        <p>
          Implementamos medidas técnicas y organizativas razonables destinadas a proteger la información: reglas de
          acceso que verifican identidad y permisos en cada operación, autenticación adicional para acciones
          sensibles (como eliminar tu cuenta), roles de administrador verificados criptográficamente, límites de
          frecuencia contra abuso, verificación de firma en las integraciones que la requieren, y respaldos
          periódicos automáticos de la base de datos.
        </p>
        <p>
          No prometemos un método de cifrado específico más allá del que provee nuestra infraestructura de base
          (Google Cloud), ni afirmamos haber pasado auditorías de seguridad externas o certificaciones — no las
          tenemos hoy. Ningún sistema es completamente seguro.
        </p>
      </LegalSection>

      <LegalSection id="retencion" title="12. Retención de datos">
        <p>
          Todavía no tenemos una política de retención formal y definitiva. Conservamos los datos mientras sean
          necesarios para prestarte el servicio, por motivos de seguridad, para cumplir obligaciones legales, o
          para el funcionamiento general de la plataforma.
        </p>
        <p>
          Un caso concreto que sí podemos confirmar: los pedidos de venta dentro de un evento que quedan sin pagar o
          son rechazados se eliminan automáticamente después de 48 horas sin actividad.
        </p>
      </LegalSection>

      <LegalSection id="eliminacion" title="13. Eliminación de datos">
        <p>
          Puedes eliminar tu cuenta desde tu perfil. Esto elimina, de forma permanente: tus eventos propios (con
          todos sus invitados y check-ins), tu acceso a eventos donde colaborabas, y tu información de cuenta.
        </p>
        <p>
          <strong>Con honestidad sobre los límites de esto:</strong> algunos rastros de tu actividad dentro de
          eventos de <em>otros</em> organizadores no se eliminan al borrar tu cuenta — por ejemplo, si confirmaste
          el pago de un invitado o escaneaste un pase como colaborador, ese registro queda asociado al evento del
          organizador, porque le pertenece a él, no a ti. Tampoco garantizamos hoy que eliminar un evento borre
          absolutamente todos sus datos operativos internos (por ejemplo, algunos registros de mesas o de ventas
          pueden quedar en nuestros sistemas incluso después de eliminar el evento desde el panel) — ver la sección
          "Problemas técnicos que recomendamos solucionar antes de publicar" al final de esta página.
        </p>
        <p>
          Como organizador, puedes eliminar a un invitado individual en cualquier momento; esta acción es
          permanente. Como invitado, puedes cancelar tu propia asistencia (si ya la habías confirmado), lo que
          elimina tu registro de la misma forma.
        </p>
      </LegalSection>

      <LegalSection id="menores" title="14. Menores de edad">
        <p>
          Ver "Edad mínima" en los Términos y Condiciones. Hoy no verificamos la edad de quien usa PaseLink. La
          única restricción relacionada con la edad que existe técnicamente es que comentar en el muro de un evento
          está limitado a mayores de 18 años según la fecha de nacimiento que la propia persona haya indicado, sin
          verificación real — cualquiera puede seguir viendo el contenido público de un evento.
        </p>
      </LegalSection>

      <LegalSection id="derechos" title="15. Tus derechos">
        <p>
          Dependiendo del país desde el que uses PaseLink, es posible que tengas derechos sobre tus datos
          personales (por ejemplo, acceder a ellos, corregirlos o solicitar su eliminación). Hoy puedes ejercer
          varios de estos derechos directamente desde la app: eliminar tu cuenta, editar tu perfil, o pedirle al
          organizador que corrija o elimine tu registro como invitado.
        </p>
        <p>
          <strong>Pendiente de revisión legal:</strong> no enumeramos derechos legales específicos (por ejemplo, los
          de una ley de protección de datos en particular) porque todavía no hemos determinado con asesoría legal
          qué legislación aplica a cada usuario según su país. Si quieres ejercer un derecho relacionado con tus
          datos que no puedas resolver directamente en la app, escríbenos (ver "Contacto").
        </p>
      </LegalSection>

      <LegalSection id="transferencias" title="16. Transferencias internacionales">
        <p>
          Algunos de nuestros proveedores (Firebase/Google Cloud, Cloudinary, Brevo, Sentry, y Meta si WhatsApp está
          activo) pueden procesar información en servidores ubicados fuera de tu país. <strong>Pendiente de
          revisión legal:</strong> no afirmamos que estas transferencias cumplan con un mecanismo legal específico
          (como cláusulas contractuales estándar) porque eso todavía no se ha confirmado formalmente.
        </p>
      </LegalSection>

      <LegalSection id="cambios" title="17. Cambios a esta política">
        <p>
          Podemos actualizar esta Política de Privacidad. Cuando publiquemos cambios, se reflejará una nueva versión
          y fecha en esta página, y si el cambio lo amerita, te pediremos aceptarla nuevamente la próxima vez que
          inicies sesión — sin borrar el historial de tus aceptaciones anteriores.
        </p>
      </LegalSection>

      <LegalSection id="jurisdiccion" title="18. Jurisdicción">
        <p><strong>Pendiente de definir</strong> — misma nota que en los Términos y Condiciones:</p>
        <ul className="list-disc pl-5 space-y-1 font-mono text-xs sm:text-sm">
          <li>Razón social responsable de PaseLink: [RAZÓN SOCIAL]</li>
          <li>Domicilio legal: [DOMICILIO LEGAL]</li>
          <li>Legislación aplicable y jurisdicción: [JURISDICCIÓN]</li>
        </ul>
      </LegalSection>

      <LegalSection id="contacto" title="19. Contacto">
        <p>
          Para solicitudes relacionadas con tus datos personales:{' '}
          <a href="mailto:ericmunoz441@gmail.com" className="text-primary font-medium">
            ericmunoz441@gmail.com
          </a>
          .
        </p>
        <p className="font-mono text-xs sm:text-sm">Correo legal dedicado: [CORREO LEGAL] (pendiente de definir).</p>
      </LegalSection>
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
    <LegalPageLayout docId="privacy" sections={PRIVACY_SECTIONS}>
      <PrivacyContent />
    </LegalPageLayout>
  )
}
