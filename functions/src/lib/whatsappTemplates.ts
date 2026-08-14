// Registro de plantillas de WhatsApp Business — un solo lugar para
// mantener nombre/idioma/variables por tipo de notificación, en vez de
// construir el payload de Meta a mano dentro de cada caller (ver §6 del
// issue: "no hardcodees toda la lógica dentro de cada Cloud Function").
//
// El nombre de acá (`oferta_lugar`) es el definido en
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md §10.3 — DEBE coincidir
// exactamente con el nombre y el orden de variables de la plantilla ya
// aprobada en Meta Business Manager cuando se configure (§10.4, trámite
// externo). Si el texto final aprobado por Meta pide reordenar/quitar una
// variable, se ajusta acá — ningún caller arma componentes a mano.
export type WhatsAppTemplateKind = 'waitlist_offer'

export interface WhatsAppTemplateDef {
  name: string
  language: string
  // Orden posicional de las variables {{1}}, {{2}}... del body de la
  // plantilla — Meta exige mandarlas en ese orden, sin nombres.
  buildBodyParams: (vars: Record<string, string>) => string[]
}

export const WHATSAPP_TEMPLATES: Record<WhatsAppTemplateKind, WhatsAppTemplateDef> = {
  // "Hola {{1}}, se liberó un lugar para ti en {{2}}. Confirma tu
  // asistencia antes de {{3}} en este link: {{4}} Te esperamos." — Meta
  // rechaza plantillas que terminan en una variable (un simple punto
  // después no alcanza, hace falta una palabra real).
  waitlist_offer: {
    name: 'oferta_lugar',
    language: 'es_MX',
    buildBodyParams: (vars) => [vars.guestName, vars.eventName, vars.deadline, vars.link],
  },
}
