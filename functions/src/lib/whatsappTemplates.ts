// Registro de plantillas de WhatsApp Business — un solo lugar para
// mantener nombre/idioma/variables por tipo de notificación, en vez de
// construir el payload de Meta a mano dentro de cada caller (ver §6 del
// issue: "no hardcodees toda la lógica dentro de cada Cloud Function").
//
// Los dos nombres de acá (`oferta_lugar`, `reconfirmar`) son los definidos
// en WAITLIST_RECONFIRMATION_ARCHITECTURE.md §10.3 — DEBEN coincidir
// exactamente con el nombre y el orden de variables de la plantilla ya
// aprobada en Meta Business Manager cuando se configure (§10.4, trámite
// externo). Si el texto final aprobado por Meta pide reordenar/quitar una
// variable, se ajusta acá — ningún caller arma componentes a mano.
export type WhatsAppTemplateKind = 'waitlist_offer' | 'reconfirm_request'

export interface WhatsAppTemplateDef {
  name: string
  language: string
  // Orden posicional de las variables {{1}}, {{2}}... del body de la
  // plantilla — Meta exige mandarlas en ese orden, sin nombres.
  buildBodyParams: (vars: Record<string, string>) => string[]
}

export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKind, WhatsAppTemplateDef> = {
  // "Hola {{1}}, se liberó un lugar para vos en {{2}}. Confirmá tu
  // asistencia antes de {{3}} en este link: {{4}}"
  waitlist_offer: {
    name: 'oferta_lugar',
    language: 'es_MX',
    buildBodyParams: (vars) => [vars.guestName, vars.eventName, vars.deadline, vars.link],
  },
  // "Hola {{1}}, {{2}} pidió reconfirmar tu asistencia a {{3}}. Respondé
  // antes de {{4}} para no perder tu lugar: {{5}}"
  reconfirm_request: {
    name: 'reconfirmar',
    language: 'es_MX',
    buildBodyParams: (vars) => [vars.guestName, vars.organizerName, vars.eventName, vars.deadline, vars.link],
  },
}
