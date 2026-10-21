/*
 * Layout dos emails do Portal da Catequese.
 *
 * HTML de email: tabelas, estilos em linha e nada de imagens obrigatórias
 * (muitos clientes bloqueiam-nas). Funciona no Gmail, Outlook (incluindo o
 * Outlook para Windows, com o botão em VML), Apple Mail e telemóveis; onde
 * o cliente o permite, há também modo escuro.
 */

/** Cores do portal (azul paroquial e dourado). */
export const MAIL = {
  page: "#eef1f6",
  card: "#ffffff",
  ink: "#16213a",
  body: "#33405a",
  muted: "#6b7891",
  line: "#e3e8f0",
  navy: "#1b3266",
  navyDeep: "#132650",
  gold: "#c9a54d",
  goldSoft: "#f8f2e1",
  goldInk: "#7a5a12",
  info: "#eaf0fb",
  infoInk: "#1f3d7a",
  success: "#e8f5ee",
  successInk: "#1d6b43",
  warning: "#fdf3e4",
  warningInk: "#8a5300",
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',Times,serif";

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

/** Dados da paróquia para o cabeçalho, os botões e o rodapé. */
export interface MailBrand {
  /** URL do portal (ex.: https://catequese.cristoreidapaz.ao). */
  portalUrl: string;
  /** Contacto da secretaria (o "Responder a"). */
  contactEmail: string;
}

/** Escapa texto para HTML (nunca confiar no que vem de formulários). */
export function e(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${MAIL.body}" class="body">${html}</p>`;
}

/** Texto com mudanças de linha → parágrafos (escapado aqui). */
export function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => paragraph(e(block).replace(/\n/g, "<br/>")))
    .join("");
}

export function muted(html: string): string {
  return `<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.6;color:${MAIL.muted}" class="muted">${html}</p>`;
}

export function greeting(firstName: string): string {
  return paragraph(`Olá, <strong style="color:${MAIL.ink}" class="ink">${e(firstName)}</strong>.`);
}

/** Botão "à prova de bala": tabela + VML para o Outlook do Windows. */
export function mailButton(href: string, label: string): string {
  const url = e(href);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px">
  <tr>
    <td align="left">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:48px;v-text-anchor:middle;width:260px" arcsize="22%" stroke="f" fillcolor="${MAIL.navy}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${e(label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${url}" target="_blank" rel="noopener" class="button"
        style="display:inline-block;background:${MAIL.navy};border-radius:10px;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;mso-hide:all">${e(label)}&nbsp;&rarr;</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/** Ligação de recurso, para quem não consegue carregar no botão. */
export function fallbackLink(href: string): string {
  return muted(
    `Se o botão não funcionar, copie este endereço para o navegador:<br/><a href="${e(href)}" style="color:${MAIL.navy};word-break:break-all" class="link">${e(href)}</a>`,
  );
}

/** Código de verificação grande, num só bloco (fácil de copiar). */
export function mailCode(code: string): string {
  const digits = code.replace(/\s/g, "");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px">
  <tr>
    <td align="center" style="background:${MAIL.goldSoft};border:1px solid #ecdcae;border-radius:14px;padding:22px 16px" class="code-box">
      <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${MAIL.goldInk}" class="code-label">O seu código</p>
      <p style="margin:0;font-family:'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;font-size:34px;font-weight:700;letter-spacing:0.32em;color:${MAIL.ink};mso-line-height-rule:exactly;line-height:44px" class="ink">${e(digits)}</p>
    </td>
  </tr>
</table>`;
}

const CALLOUT = {
  info: { bg: MAIL.info, ink: MAIL.infoInk, bar: MAIL.navy, cls: "callout-info" },
  success: { bg: MAIL.success, ink: MAIL.successInk, bar: "#2f9e64", cls: "callout-success" },
  warning: { bg: MAIL.warning, ink: MAIL.warningInk, bar: "#e0a030", cls: "callout-warning" },
} as const;

/** Caixa de destaque (informação, sucesso ou atenção). */
export function callout(html: string, tone: keyof typeof CALLOUT = "info"): string {
  const style = CALLOUT[tone];
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0">
  <tr>
    <td style="background:${style.bg};border-left:4px solid ${style.bar};border-radius:10px;padding:14px 18px;font-family:${FONT};font-size:14px;line-height:1.6;color:${style.ink}" class="${style.cls}">${html}</td>
  </tr>
</table>`;
}

/** Lista de dados (rótulo → valor), ex.: destinatários e data de um aviso. */
export function details(rows: [label: string, value: string][]): string {
  const cells = rows
    .map(([label, value], index) => {
      const border = index ? `border-top:1px solid ${MAIL.line};` : "";
      return `<tr>
    <td style="padding:10px 0;${border}font-family:${FONT};font-size:13px;color:${MAIL.muted};width:38%;vertical-align:top" class="muted row-line">${e(label)}</td>
    <td style="padding:10px 0;${border}font-family:${FONT};font-size:14px;font-weight:600;color:${MAIL.ink};vertical-align:top" class="ink row-line">${e(value)}</td>
  </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px">${cells}</table>`;
}

/** Bloco de conteúdo citado (ex.: o texto de um aviso). */
export function quote(html: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0">
  <tr>
    <td style="background:#f7f9fc;border:1px solid ${MAIL.line};border-radius:12px;padding:20px 22px 6px" class="quote">${html}</td>
  </tr>
</table>`;
}

function header(brand: MailBrand): string {
  return `<tr>
  <td style="background:${MAIL.navyDeep};background-image:linear-gradient(135deg,${MAIL.navyDeep} 0%,${MAIL.navy} 100%);border-radius:18px 18px 0 0;padding:26px 36px" class="header">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td width="46" style="vertical-align:middle">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td width="42" height="42" align="center" style="width:42px;height:42px;border:1.5px solid ${MAIL.gold};border-radius:21px;font-family:${SERIF};font-size:20px;line-height:42px;color:${MAIL.gold}">&#10013;</td>
            </tr>
          </table>
        </td>
        <td style="padding-left:14px;vertical-align:middle">
          <a href="${e(brand.portalUrl)}" target="_blank" rel="noopener" style="text-decoration:none">
            <span style="display:block;font-family:${SERIF};font-size:20px;line-height:24px;color:#ffffff">Portal da Catequese</span>
            <span style="display:block;font-family:${FONT};font-size:12px;line-height:18px;letter-spacing:0.08em;text-transform:uppercase;color:#c8d3ea">Paróquia Cristo Rei da Paz</span>
          </a>
        </td>
      </tr>
    </table>
  </td>
</tr>
<tr>
  <td height="3" style="height:3px;background:${MAIL.gold};font-size:0;line-height:0">&nbsp;</td>
</tr>`;
}

function footer(brand: MailBrand, note: string): string {
  const year = new Date().getFullYear();
  return `<tr>
  <td style="padding:28px 24px 8px;text-align:center" class="footer">
    <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MAIL.muted}" class="muted">${e(note)}</p>
    <p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MAIL.muted}" class="muted">
      <a href="${e(brand.portalUrl)}" target="_blank" rel="noopener" style="color:${MAIL.navy};text-decoration:none;font-weight:600" class="link">Abrir o portal</a>
      &nbsp;&middot;&nbsp;
      <a href="mailto:${e(brand.contactEmail)}" style="color:${MAIL.navy};text-decoration:none;font-weight:600" class="link">${e(brand.contactEmail)}</a>
    </p>
    <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.6;color:#98a3b8">&copy; ${year} Paróquia Cristo Rei da Paz &middot; Luanda, Angola</p>
  </td>
</tr>`;
}

/** Estilos para clientes que os aceitam (modo escuro e telemóvel). */
const HEAD_STYLES = `<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  @media (max-width: 620px) {
    .container { width: 100% !important; }
    .content { padding: 28px 22px 30px !important; }
    .header { padding: 22px !important; }
    .title { font-size: 22px !important; line-height: 28px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .page { background: #0e1525 !important; }
    .card { background: #172036 !important; border-color: #26324d !important; }
    .ink, .title { color: #f1f4fa !important; }
    .body { color: #cbd3e3 !important; }
    .muted { color: #93a0b8 !important; }
    .link { color: #9fb8ef !important; }
    .eyebrow { color: #e0c27a !important; }
    .quote { background: #1d2842 !important; border-color: #2b3854 !important; }
    .row-line { border-color: #2b3854 !important; }
    .code-box { background: #2a2617 !important; border-color: #5b4c22 !important; }
    .code-label { color: #e0c27a !important; }
    .callout-info { background: #1c2a4a !important; color: #c9d8f8 !important; }
    .callout-success { background: #17342a !important; color: #b9e6cd !important; }
    .callout-warning { background: #3a2c14 !important; color: #f3d6a2 !important; }
  }
</style>`;

/**
 * O email completo: cabeçalho da paróquia, cartão com o título e o conteúdo,
 * e rodapé com contactos e o motivo de o receber.
 */
export function mailLayout(opts: {
  brand: MailBrand;
  /** Texto que o cliente mostra a seguir ao assunto. */
  preview: string;
  /** Rótulo pequeno por cima do título (ex.: "Aviso da coordenação"). */
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  /** Porque recebeu este email. */
  footerNote?: string;
}): string {
  const note =
    opts.footerNote ??
    "Recebeu este email por ter uma conta no Portal da Catequese. É uma mensagem automática: para falar connosco, escreva para o contacto abaixo.";
  // Preenchimento invisível: evita que o cliente mostre o início do corpo na pré-visualização.
  const previewFill = "&#8199;&#65279;&#847; ".repeat(40);

  return `<!DOCTYPE html>
<html lang="pt" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no"/>
  <meta name="color-scheme" content="light dark"/>
  <meta name="supported-color-schemes" content="light dark"/>
  <title>${e(opts.title)}</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
  ${HEAD_STYLES}
</head>
<body style="margin:0;padding:0;width:100%;background:${MAIL.page}" class="page">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${e(opts.preview)}${previewFill}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${MAIL.page}" class="page">
    <tr>
      <td align="center" style="padding:32px 12px 40px">
        <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="article" aria-roledescription="email" aria-label="${e(opts.title)}" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px" class="container">
          ${header(opts.brand)}
          <tr>
            <td style="background:${MAIL.card};border:1px solid ${MAIL.line};border-top:none;border-radius:0 0 18px 18px;padding:36px 40px 38px" class="card content">
              ${opts.eyebrow ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${MAIL.goldInk}" class="eyebrow">${e(opts.eyebrow)}</p>` : ""}
              <h1 style="margin:0 0 22px;font-family:${SERIF};font-size:26px;font-weight:normal;line-height:32px;color:${MAIL.ink}" class="title">${e(opts.title)}</h1>
              ${opts.bodyHtml}
              <p style="margin:28px 0 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${MAIL.body}" class="body">Com estima,<br/><strong style="color:${MAIL.ink}" class="ink">Coordenação da Catequese</strong></p>
            </td>
          </tr>
          ${footer(opts.brand, note)}
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Versão em texto simples (clientes sem HTML e filtros de spam). */
export function plainText(brand: MailBrand, lines: (string | undefined | false)[]): string {
  return [
    ...lines.filter((line): line is string => typeof line === "string"),
    "",
    "Com estima,",
    "Coordenação da Catequese",
    "",
    "—",
    "Portal da Catequese · Paróquia Cristo Rei da Paz",
    `${brand.portalUrl} · ${brand.contactEmail}`,
  ].join("\n");
}
