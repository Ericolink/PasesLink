// Pipeline conceptual: Link -> Link type -> Event -> Link creator -> Metadata
// (ver el resto de functions/src/linkMeta/). Hoy solo existe la rama
// 'self_registration' (enlaces /e/:id, ver eventJoinMeta.ts) — agregar otro
// tipo de enlace a futuro (invitación de colaborador, check-in) significa un
// archivo build*Metadata.ts nuevo que produzca un LinkMetadata, más un
// branch en el LinkType de abajo, sin tocar resolveLinkCreator ni
// injectMetaTags.
export type LinkType = 'self_registration'

export interface LinkMetadata {
  title: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  twitterTitle: string
  twitterDescription: string
  twitterImage: string
}
