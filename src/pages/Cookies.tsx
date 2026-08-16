import { useSeoMeta } from '../hooks/useSeoMeta'
import { LegalPageLayout, LegalSection } from '../components/legal/LegalPageLayout'
import { COOKIES_SECTIONS } from '../legal/sections'

// Documento separado de la Política de Privacidad (en vez de una sección
// más dentro de ella) porque hay suficiente detalle propio — el inventario
// completo de localStorage/sessionStorage, más las cookies de terceros de
// Google AdSense/Analytics — como para merecer su propia página enlazable,
// en vez de alargar la Privacidad con una lista larga de claves técnicas.
// A diferencia de Terms/Privacy, este documento es informativo: PaseLink no
// usa cookies propias, así que no exige un checkbox de aceptación (ver
// `requiresAcceptance: false` en src/legal/documents.ts).
//
// NOTA INTERNA — REVISIÓN LEGAL RECOMENDADA: si en el futuro se activa
// publicidad/analítica de forma permanente para visitantes de la Unión
// Europea/Reino Unido, confirmar si el aviso de consentimiento de Google
// (Funding Choices, ver Privacidad §8) es suficiente por sí solo o si hace
// falta un banner de cookies propio con opción de rechazar.
export function CookiesContent() {
  return (
    <>
      <LegalSection id="que-cubre" title="1. Qué cubre este aviso">
        <p>
          Este aviso explica exactamente qué guarda PaseLink en tu navegador y por qué — sin llamar "cookie" a todo
          lo que se almacena localmente, porque no es lo mismo una cookie que el almacenamiento técnico que usa la
          propia aplicación.
        </p>
      </LegalSection>

      <LegalSection id="cookies-propias" title="2. Cookies propias">
        <p><strong>PaseLink no usa cookies propias.</strong> No creamos ninguna cookie de seguimiento, publicitaria ni de sesión por nuestra cuenta.</p>
      </LegalSection>

      <LegalSection id="cookies-terceros" title="3. Cookies y tecnologías de terceros">
        <p>Las únicas cookies que pueden aparecer en PaseLink son de dos proveedores, y solo cuando esas funciones están activas:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Google AdSense</strong> — si la publicidad está activa en la página de inicio o en la invitación pública de un evento, Google puede usar cookies para mostrar y medir anuncios. Ver Privacidad §8.</li>
          <li><strong>Firebase Analytics / Google Analytics</strong> — si la analítica está activa, Google puede usar cookies para distinguir visitas y medir el uso de la plataforma. Ver Privacidad §6.</li>
        </ul>
        <p>
          Estas cookies las gestiona Google directamente, no PaseLink. Si visitas desde la Unión Europea, el Reino
          Unido o Suiza, Google puede mostrarte su propio aviso de consentimiento antes de activar publicidad
          personalizada.
        </p>
      </LegalSection>

      <LegalSection id="almacenamiento-local" title="4. Almacenamiento local (localStorage)">
        <p>Guardamos lo siguiente directamente en tu navegador, sin enviarlo a nuestros servidores salvo que se indique lo contrario:</p>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs sm:text-sm border-collapse min-w-[520px]">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 pr-4 font-medium">Para qué</th>
                <th className="py-2 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {[
                ['Preferencia de tema', 'Claro, oscuro o según tu sistema.'],
                ['Bienvenida y novedades', 'Evitar mostrarte el mismo aviso más de una vez por cuenta.'],
                ['Registro en un evento', 'Evitar que el mismo navegador se autorregistre dos veces al mismo evento.'],
                ['Muro sin cuenta', 'Un identificador anónimo de dispositivo y el nombre que elegiste, para poder publicar en el muro sin iniciar sesión.'],
                ['Clima y ruta del evento', 'Una copia temporal (hasta 60 minutos) del pronóstico y la ruta, para no consultarlos de nuevo en cada visita.'],
                ['Tus pedidos de venta del evento', 'Recordar en este dispositivo qué pediste, si el evento tiene venta de comida o bebida.'],
                ['Borrador de formularios', 'Guardar automáticamente lo que llevas escrito al crear o editar un evento, por si cierras la pestaña sin querer.'],
                ['Buzón de sugerencias', 'Evitar envíos repetidos en poco tiempo cuando escribes sin haber iniciado sesión.'],
                ['Identificación de tu pase', 'Reconocer el dispositivo que abrió un pase en particular.'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white align-top whitespace-nowrap">{k}</td>
                  <td className="py-2 text-gray-700 dark:text-gray-300 align-top">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection id="sesion" title="5. Almacenamiento de sesión (sessionStorage)">
        <p>Se borra automáticamente al cerrar la pestaña. Lo usamos para:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Evitar un bucle de recarga si falla la carga de una parte de la aplicación.</li>
          <li>Un contador interno (solo visible para administradores) de cuántas sesiones distintas se abrieron.</li>
          <li>Recordar si ya cerraste la invitación a crear una cuenta, mientras sigues en esa pestaña.</li>
        </ul>
      </LegalSection>

      <LegalSection id="indexeddb" title="6. IndexedDB (sesión de tu cuenta)">
        <p>
          Cuando inicias sesión, el sistema de autenticación de Firebase guarda tu sesión en IndexedDB de tu
          navegador — es el mecanismo estándar con el que Firebase mantiene tu sesión iniciada entre visitas, no
          algo que PaseLink construya por su cuenta. Nuestra base de datos también usa IndexedDB para poder mostrar
          información ya cargada aunque pierdas la conexión momentáneamente.
        </p>
      </LegalSection>

      <LegalSection id="gestionar" title="7. Cómo gestionar esto">
        <p>
          Puedes borrar el almacenamiento local y las cookies desde la configuración de tu navegador en cualquier
          momento — algunas funciones (como recordar tu tema o evitar un registro duplicado) dejarán de funcionar
          hasta que vuelvas a usarlas. Para gestionar la publicidad personalizada de Google, puedes usar la{' '}
          <a
            href="https://myadcenter.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium"
          >
            configuración de anuncios de Google
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection id="cambios" title="8. Cambios a este aviso">
        <p>
          Podemos actualizar este aviso si cambia lo que almacenamos en tu navegador. Se reflejará una nueva versión
          y fecha en esta misma página.
        </p>
      </LegalSection>

      <LegalSection id="contacto" title="9. Contacto">
        <p>
          Para preguntas sobre este aviso:{' '}
          <a href="mailto:ericmunoz441@gmail.com" className="text-primary font-medium">
            ericmunoz441@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </>
  )
}

export function Cookies() {
  useSeoMeta({
    title: 'Aviso de cookies',
    description: 'Qué cookies, localStorage y sessionStorage usa PaseLink, y cuáles son de terceros como Google AdSense o Analytics.',
    path: '/cookies',
  })
  return (
    <LegalPageLayout docId="cookies" sections={COOKIES_SECTIONS}>
      <CookiesContent />
    </LegalPageLayout>
  )
}
