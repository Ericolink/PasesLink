import { useSeoMeta } from '../hooks/useSeoMeta'
import { LegalPageLayout, LegalSection } from '../components/legal/LegalPageLayout'
import { TERMS_SECTIONS } from '../legal/sections'

// Contenido separado del layout de página para poder reusarlo dentro de
// LegalDocumentSheet (el modal que se abre desde el registro) sin duplicar
// texto — por eso no tiene su propio <h1> ni fecha (el modal y la página
// completa los muestran por su cuenta, ver LegalDocumentSheet.tsx y
// LegalPageLayout.tsx).
//
// Redactado a partir de la auditoría técnica de PaseLink (2026-08-15): cada
// afirmación aquí corresponde a una funcionalidad real y verificada en el
// código, no a una plantilla genérica. Ningún dato de la sección 18
// (legislación aplicable) fue inventado — son placeholders a propósito.
//
// NOTA INTERNA — REVISIÓN LEGAL RECOMENDADA antes de publicar como versión
// definitiva: jurisdicción/legislación aplicable (§18), límite de
// responsabilidad (§16), edad mínima (§12), datos de terceros/acompañantes
// (§5 y Privacidad §5), y cancelaciones/reembolsos (§15). Este documento no
// es asesoría legal ni garantiza cumplimiento de ninguna ley o regulación.
export function TermsContent() {
  return (
    <>
      <LegalSection id="servicio" title="1. Qué es PaseLink">
        <p>
          PaseLink es una plataforma tecnológica que permite a un organizador crear eventos, gestionar su lista de
          invitados, generar pases digitales con código QR, controlar el acceso en la puerta y, opcionalmente,
          vender comida o bebida dentro del evento. El servicio se ofrece "tal cual", actualmente en fase beta.
        </p>
        <p>
          PaseLink es la herramienta que usa el organizador para gestionar su evento — no es el organizador del
          evento, no es el proveedor del lugar ni de la comida/bebida, y no participa en las decisiones que el
          organizador toma sobre su propio evento.
        </p>
      </LegalSection>

      <LegalSection id="cuentas" title="2. Tu cuenta">
        <p>
          Puedes crear una cuenta con correo y contraseña, o con tu cuenta de Google. Eres responsable de mantener
          tus credenciales seguras y de toda actividad que ocurra desde tu cuenta.
        </p>
        <p>
          Una misma persona puede usar PaseLink como organizador de sus propios eventos y, al mismo tiempo, como
          invitado de eventos de otros organizadores — la cuenta es la misma en ambos casos.
        </p>
      </LegalSection>

      <LegalSection id="rol-organizador" title="3. El rol del organizador">
        <p>Si creas un evento en PaseLink, eres el organizador de ese evento, y eso significa que tú:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Decides qué información le pides a tus invitados (nombre, teléfono, correo, respuestas personalizadas, etc.).</li>
          <li>Eres responsable de contar con una base legítima o autorización adecuada para recopilar y usar esos datos, incluyendo los que un invitado nos comparte sobre otras personas (ver "Datos de acompañantes" en la Política de Privacidad).</li>
          <li>Defines las condiciones de acceso a tu evento (cupo, métodos de pago aceptados, requisitos).</li>
          <li>Eres responsable de los pagos que recibes directamente de tus invitados, y de cualquier cancelación, cambio o reembolso relacionado con tu evento (ver "Pagos" y "Cancelaciones" más abajo).</li>
          <li>Eres responsable del contenido que publiques en tu evento y de moderar razonablemente el que publiquen tus invitados en el muro/historias.</li>
          <li>Eres responsable de usar los datos de tus invitados solo para los fines de tu evento, y de otorgar permisos de colaborador de forma responsable.</li>
        </ul>
        <p>
          PaseLink te da la infraestructura para gestionar tu evento (base de datos, pases, escáner, reportes), pero
          no revisa ni aprueba las decisiones que tomas como organizador, y no es responsable de ellas.
        </p>
      </LegalSection>

      <LegalSection id="pases-qr" title="4. Pases y códigos QR">
        <p>
          Cada invitado recibe un pase digital con un código QR único, accesible mediante un enlace personal. El
          organizador (o quien tenga permiso de escáner) usa la app para leer ese código y registrar el ingreso o la
          salida del invitado.
        </p>
        <p>
          El código QR identifica al pase, no a la persona que lo presenta. Si alguien comparte el enlace de su
          pase, cualquiera que lo reciba puede verlo y presentarlo en la puerta — PaseLink no verifica la identidad
          de quien escanea ni de quien es escaneado. Si un mismo código ya fue usado para entrar, el sistema lo
          señala al volver a escanearlo, pero eso no evita que alguien intente compartir su pase antes de usarlo.
          Recomendamos a los invitados no compartir el enlace de su pase, y a los organizadores no depender
          exclusivamente del QR como única medida de seguridad de su evento.
        </p>
      </LegalSection>

      <LegalSection id="colaboradores" title="5. Colaboradores y roles">
        <p>
          El organizador puede invitar a otras personas a ayudarlo a administrar el evento (por ejemplo, para recibir
          invitados, cobrar en caja, gestionar ventas o preparar pedidos), otorgándoles un rol con permisos
          específicos definidos por PaseLink. El acceso de cada colaborador queda limitado a las capacidades que ese
          rol permite dentro de la plataforma.
        </p>
        <p>
          El organizador es responsable de a quién invita como colaborador y de asignar permisos de forma
          razonable, considerando qué información de sus invitados quedará visible para esa persona.
        </p>
      </LegalSection>

      <LegalSection id="pagos" title="6. Pagos">
        <p><strong>PaseLink no es una pasarela de pago.</strong> Concretamente:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>No procesamos tarjetas ni almacenamos datos de tarjetas.</li>
          <li>No recibimos directamente el dinero de las entradas de tu evento.</li>
          <li>No procesamos reembolsos.</li>
        </ul>
        <p>
          Cuando un evento requiere pago, el organizador configura los métodos que acepta — hoy, transferencia
          bancaria y/o efectivo. El dinero se mueve directamente entre el invitado y el organizador, fuera de
          PaseLink. Lo que hace PaseLink es permitir que el organizador (o un colaborador con el permiso
          correspondiente) registre y controle el estado de ese pago dentro de la plataforma, para efectos de
          control de acceso.
        </p>
      </LegalSection>

      <LegalSection id="ventas-evento" title="7. Ventas del evento (menú)">
        <p>
          Algunos eventos permiten pedir comida o bebida dentro de la plataforma. El organizador define qué se
          vende, a qué precio, en qué cantidad y bajo qué condiciones de pago y entrega. PaseLink no es el vendedor
          de esos productos — es la herramienta que el organizador usa para gestionar su propio catálogo y pedidos.
          El pago de estos pedidos sigue el mismo criterio que la sección "Pagos": transferencia o efectivo,
          validados en persona por el organizador o su personal de caja.
        </p>
      </LegalSection>

      <LegalSection id="lista-espera" title="8. Lista de espera">
        <p>
          Cuando un evento alcanza su cupo, un invitado puede anotarse en la lista de espera. Estar en la lista de
          espera <strong>no garantiza un lugar</strong>: la disponibilidad depende de que se libere cupo y de las
          reglas de prioridad que administra el organizador. PaseLink provee la herramienta para gestionar esa lista
          y notificar automáticamente cuando se libera un lugar, pero no puede prometer que un asistente en espera
          será finalmente admitido.
        </p>
      </LegalSection>

      <LegalSection id="contenido-usuarios" title="9. Contenido que publicas">
        <p>
          Algunos eventos tienen un muro de mensajes y un álbum de fotos/historias donde tú y otros asistentes
          pueden publicar contenido, en algunos casos sin necesidad de tener una cuenta. Al publicar, eres
          responsable de lo que compartes y confirmas que tienes derecho a hacerlo.
        </p>
        <p>Está prohibido publicar contenido que:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Sea ilegal, difamatorio, discriminatorio, acosador o de explotación hacia menores.</li>
          <li>Infrinja derechos de autor, marca u otros derechos de un tercero.</li>
          <li>Suplante a otra persona o evento.</li>
          <li>Constituya spam o publicidad no solicitada.</li>
        </ul>
        <p>
          Otros usuarios pueden reportar contenido que consideren inapropiado. El equipo de PaseLink revisa los
          reportes y puede eliminar contenido o restringir la posibilidad de publicar (comentar, subir fotos) a una
          cuenta, de forma temporal o permanente, de manera global o solo dentro de un evento.
        </p>
        <p>
          Conservas la propiedad del contenido que publicas (fotos, textos, comentarios). Al publicarlo en PaseLink,
          nos das una licencia limitada, no exclusiva, para almacenarlo y mostrarlo dentro de la plataforma
          únicamente con el fin de operar el evento donde lo publicaste — no lo usamos para ningún otro propósito.
        </p>
      </LegalSection>

      <LegalSection id="uso-prohibido" title="10. Uso prohibido">
        <p>Además de lo indicado sobre contenido, no puedes usar PaseLink para:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Cometer fraude o intentar engañar a otros organizadores o invitados.</li>
          <li>Intentar acceder sin autorización a cuentas, eventos o datos que no te pertenecen.</li>
          <li>Manipular, falsificar o intentar duplicar de forma indebida un código QR o pase.</li>
          <li>Explotar vulnerabilidades de seguridad de la plataforma.</li>
          <li>Extraer datos de forma masiva y automatizada (scraping) sin autorización.</li>
          <li>Suplantar a otra persona, evento u organización.</li>
          <li>Usar la plataforma para cualquier actividad ilícita.</li>
        </ul>
      </LegalSection>

      <LegalSection id="propiedad-intelectual" title="11. Propiedad intelectual">
        <p>
          La marca PaseLink, el software, el diseño y la interfaz de la plataforma son propiedad de PaseLink (o de
          sus licenciantes). Nada en estos Términos te transfiere derechos sobre ellos, más allá del uso razonable
          del servicio.
        </p>
        <p>
          El contenido que tú, como organizador o invitado, cargas a la plataforma (información del evento,
          imágenes, textos, fotos, comentarios) sigue siendo tuyo — ver "Contenido que publicas" arriba para el
          alcance exacto de la licencia que nos das.
        </p>
      </LegalSection>

      <LegalSection id="edad-minima" title="12. Edad mínima">
        <p>
          <strong>Provisional — pendiente de revisión legal:</strong> por ahora, para crear una cuenta y usar
          PaseLink debes tener al menos 18 años, o contar con el consentimiento de madre, padre o tutor legal si
          tienes menos. Esta redacción es un punto de partida razonable, no una cifra definitiva: la edad mínima
          adecuada depende de un análisis legal que todavía no se ha hecho, y puede cambiar cuando esa revisión se
          complete.
        </p>
        <p>
          Hoy, PaseLink <strong>no verifica la edad</strong> de quien crea una cuenta ni de quien se autorregistra
          como invitado — es información que no se solicita en el registro estándar. La única restricción de edad
          que existe técnicamente hoy es que solo los mayores de 18 años (según la fecha de nacimiento que la propia
          persona haya indicado, sin verificación) pueden comentar en el muro de un evento; cualquiera puede seguir
          viendo el contenido y reaccionar con "me gusta". Esto no equivale a una verificación real de edad.
        </p>
      </LegalSection>

      <LegalSection id="disponibilidad" title="13. Disponibilidad del servicio">
        <p>
          Al estar en fase beta, el servicio puede presentar interrupciones, cambios o ajustes sin previo aviso, y
          las funcionalidades descritas aquí pueden evolucionar. Recomendamos exportar respaldos (PDF/CSV) de
          información importante antes de eventos críticos.
        </p>
      </LegalSection>

      <LegalSection id="eliminacion" title="14. Eliminación de cuentas, eventos e invitados">
        <p>
          Puedes eliminar tu cuenta en cualquier momento desde tu perfil. Al hacerlo, se eliminan tus eventos
          propios (con todos sus invitados, historial de check-ins y demás información asociada) y tu cuenta. Si
          eras colaborador de eventos de otras personas, solo se retira tu acceso a esos eventos — el evento en sí
          no se ve afectado.
        </p>
        <p>
          Como organizador, puedes eliminar un invitado o un evento completo desde el panel en cualquier momento;
          esta acción es permanente y no se puede deshacer. Ten en cuenta que información generada por ti dentro de
          eventos de otros organizadores (por ejemplo, si confirmaste un pago o escaneaste un pase como
          colaborador) puede permanecer asociada a ese evento aunque elimines tu cuenta — ver el detalle completo
          en la Política de Privacidad, sección "Eliminación de datos".
        </p>
      </LegalSection>

      <LegalSection id="cancelaciones" title="15. Cancelaciones, cambios y reembolsos del evento">
        <p>
          PaseLink no administra las cancelaciones, cambios de fecha ni reembolsos de un evento — esas decisiones
          corresponden exclusivamente al organizador, que es quien recibió el pago directamente del invitado. Si un
          evento se cancela o cambia, es responsabilidad del organizador comunicarlo a sus invitados y resolver
          cualquier devolución de dinero directamente con ellos.
        </p>
        <p>
          Actualmente no existe una política de reembolsos formal de PaseLink, porque PaseLink no procesa ni recibe
          los pagos. Si eres organizador, te recomendamos dejar claras tus propias condiciones de cancelación en la
          descripción de tu evento.
        </p>
      </LegalSection>

      <LegalSection id="responsabilidad" title="16. Límite de responsabilidad">
        <p>
          PaseLink es una plataforma tecnológica. No organizamos tu evento, no somos proveedores del lugar, de la
          comida o bebida que se venda en él, y no somos responsables de la seguridad física del evento ni de la
          conducta de los organizadores, colaboradores o asistentes.
        </p>
        <p>
          En la medida permitida por la ley aplicable, PaseLink no será responsable por daños indirectos derivados
          del uso de la plataforma. Esto no busca eliminar toda responsabilidad de forma desproporcionada, sino
          reflejar que somos una herramienta de gestión, no una parte del evento en sí — el alcance exacto de esta
          cláusula debe confirmarse en la revisión legal pendiente de este documento.
        </p>
      </LegalSection>

      <LegalSection id="cambios" title="17. Cambios a estos Términos">
        <p>
          Podemos actualizar estos Términos. Cuando publiquemos cambios, se reflejará una nueva versión y fecha en
          esta página. Si ya tienes una cuenta y el cambio requiere tu aceptación nuevamente, te lo pediremos la
          próxima vez que inicies sesión, sin borrar el historial de aceptaciones anteriores.
        </p>
      </LegalSection>

      <LegalSection id="legislacion" title="18. Legislación aplicable y jurisdicción">
        <p>
          <strong>Pendiente de definir.</strong> Esta sección todavía no tiene la información legal necesaria para
          completarse:
        </p>
        <ul className="list-disc pl-5 space-y-1 font-mono text-xs sm:text-sm">
          <li>Razón social responsable de PaseLink: [RAZÓN SOCIAL]</li>
          <li>Domicilio legal: [DOMICILIO LEGAL]</li>
          <li>Legislación aplicable y jurisdicción: [JURISDICCIÓN]</li>
        </ul>
        <p>
          No asumimos una jurisdicción por defecto solo porque hoy la mayoría de los eventos de PaseLink ocurren en
          México — esta sección se completará una vez definida formalmente, con revisión legal.
        </p>
      </LegalSection>

      <LegalSection id="contacto" title="19. Contacto">
        <p>
          Para preguntas generales sobre estos Términos:{' '}
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

export function Terms() {
  useSeoMeta({
    title: 'Términos y condiciones',
    description: 'Términos y condiciones de uso de PaseLink: qué es el servicio, responsabilidades del organizador y de la plataforma.',
    path: '/terminos',
  })
  return (
    <LegalPageLayout docId="terms" sections={TERMS_SECTIONS}>
      <TermsContent />
    </LegalPageLayout>
  )
}
