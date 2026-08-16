// Índices de cada documento legal, separados de Terms.tsx/Privacy.tsx/
// Cookies.tsx (que solo deben exportar componentes — regla de Fast Refresh,
// react-refresh/only-export-components) pero usados tanto por esos archivos
// (LegalPageLayout) como potencialmente por tests.
export const TERMS_SECTIONS = [
  { id: 'servicio', title: 'Qué es PaseLink' },
  { id: 'cuentas', title: 'Tu cuenta' },
  { id: 'rol-organizador', title: 'El rol del organizador' },
  { id: 'pases-qr', title: 'Pases y códigos QR' },
  { id: 'colaboradores', title: 'Colaboradores y roles' },
  { id: 'pagos', title: 'Pagos' },
  { id: 'ventas-evento', title: 'Ventas del evento (menú)' },
  { id: 'lista-espera', title: 'Lista de espera' },
  { id: 'contenido-usuarios', title: 'Contenido que publicas' },
  { id: 'uso-prohibido', title: 'Uso prohibido' },
  { id: 'propiedad-intelectual', title: 'Propiedad intelectual' },
  { id: 'edad-minima', title: 'Edad mínima' },
  { id: 'disponibilidad', title: 'Disponibilidad del servicio' },
  { id: 'eliminacion', title: 'Eliminación de cuentas, eventos e invitados' },
  { id: 'cancelaciones', title: 'Cancelaciones, cambios y reembolsos del evento' },
  { id: 'responsabilidad', title: 'Límite de responsabilidad' },
  { id: 'cambios', title: 'Cambios a estos Términos' },
  { id: 'legislacion', title: 'Legislación aplicable y jurisdicción' },
  { id: 'contacto', title: 'Contacto' },
]

export const PRIVACY_SECTIONS = [
  { id: 'que-recopilamos', title: 'Qué información recopilamos' },
  { id: 'como-usamos', title: 'Cómo usamos la información' },
  { id: 'modelo-enlaces', title: 'Cómo funcionan los enlaces de PaseLink' },
  { id: 'acompanantes', title: 'Datos de acompañantes y otros terceros' },
  { id: 'proveedores', title: 'Con quién compartimos datos' },
  { id: 'analitica', title: 'Analítica (Firebase Analytics / Google Analytics)' },
  { id: 'sentry', title: 'Monitoreo de errores (Sentry)' },
  { id: 'publicidad', title: 'Publicidad' },
  { id: 'cookies', title: 'Cookies y almacenamiento local' },
  { id: 'notificaciones', title: 'Notificaciones' },
  { id: 'seguridad', title: 'Seguridad' },
  { id: 'retencion', title: 'Retención de datos' },
  { id: 'eliminacion', title: 'Eliminación de datos' },
  { id: 'menores', title: 'Menores de edad' },
  { id: 'derechos', title: 'Tus derechos' },
  { id: 'transferencias', title: 'Transferencias internacionales' },
  { id: 'cambios', title: 'Cambios a esta política' },
  { id: 'jurisdiccion', title: 'Jurisdicción' },
  { id: 'contacto', title: 'Contacto' },
]

export const COOKIES_SECTIONS = [
  { id: 'que-cubre', title: 'Qué cubre este aviso' },
  { id: 'cookies-propias', title: 'Cookies propias' },
  { id: 'cookies-terceros', title: 'Cookies y tecnologías de terceros' },
  { id: 'almacenamiento-local', title: 'Almacenamiento local (localStorage)' },
  { id: 'sesion', title: 'Almacenamiento de sesión (sessionStorage)' },
  { id: 'indexeddb', title: 'IndexedDB (sesión de tu cuenta)' },
  { id: 'gestionar', title: 'Cómo gestionar esto' },
  { id: 'cambios', title: 'Cambios a este aviso' },
  { id: 'contacto', title: 'Contacto' },
]
