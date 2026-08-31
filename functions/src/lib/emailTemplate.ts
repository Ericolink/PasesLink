// Armazón visual compartido por los emails con marca (logo + botón + pie) —
// extraído la segunda vez que hizo falta el mismo bloque de tablas/estilos
// inline (ver onUserCreated.ts y event/upcomingReminders.ts) para no
// duplicar el layout completo en cada uno. Tablas + estilos inline (no
// <style> en <head>, no flexbox/grid) porque es lo único que renderiza
// consistente en Gmail/Outlook/Apple Mail — mismo motivo por el que la
// tipografía es system-stack en vez de la fuente custom del sitio. Color
// #D40E52 (no el --color-primary #FF1464 del sitio) por contraste AA en
// texto chico, mismo criterio que --color-primary-ink en src/index.css.
export interface BrandedEmailOptions {
  title: string
  bodyHtml: string
  ctaText?: string
  ctaUrl?: string
  // URL absoluta (Cloudinary, ver EventData.coverImage) — se muestra a todo
  // el ancho de la tarjeta, debajo del logo. Opcional porque no todo evento
  // tiene foto y el correo de bienvenida (sin evento de por medio) nunca la
  // usa.
  heroImageUrl?: string
  heroImageAlt?: string
}

export function renderBrandedEmail({ title, bodyHtml, ctaText, ctaUrl, heroImageUrl, heroImageAlt }: BrandedEmailOptions): string {
  const cta = ctaText && ctaUrl
    ? `<tr>
      <td style="padding:0 32px 32px 32px;text-align:center;">
        <a href="${ctaUrl}" style="display:inline-block;background-color:#D40E52;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">${ctaText}</a>
      </td>
    </tr>`
    : ''

  const hero = heroImageUrl
    ? `<tr>
      <td style="padding:0;">
        <img src="${heroImageUrl}" alt="${heroImageAlt || ''}" width="480" style="display:block;width:100%;max-width:480px;height:auto;" />
      </td>
    </tr>`
    : ''

  return `<div style="background-color:#F4F4F5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background-color:#FFFFFF;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:32px 32px 8px 32px;text-align:center;">
        <img src="https://www.paselink.com/Logo.png" alt="PaseLink" width="140" style="display:block;margin:0 auto;max-width:140px;height:auto;" />
      </td>
    </tr>
    ${hero}
    <tr>
      <td style="padding:16px 32px 0 32px;">
        <h1 style="margin:0 0 16px 0;font-size:20px;line-height:28px;color:#111827;text-align:center;">${title}</h1>
        ${bodyHtml}
      </td>
    </tr>
    ${cta}
    <tr>
      <td style="padding:20px 32px;border-top:1px solid #E5E7EB;text-align:center;">
        <p style="margin:0;font-size:12px;line-height:18px;color:#9CA3AF;">Recibiste este correo porque tienes una cuenta o un pase en PaseLink.</p>
      </td>
    </tr>
  </table>
</div>`
}
