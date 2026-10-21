/** Tokens visuais do Portal da Catequese (azul paroquial). */
export const MAIL = {
  bg: "#f4f6fb",
  card: "#ffffff",
  ink: "#1a2332",
  muted: "#5c6b7a",
  mark: "#2f4f8f",
  accent: "#3d6bb3",
  accentSoft: "#e8eef8",
  border: "#d8e0ec",
  button: "#2f4f8f",
  buttonText: "#ffffff",
} as const;

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function e(value: string): string {
  return escapeHtml(value);
}

export function mailBrandLogo(): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 4px">
  <tr>
    <td style="padding-right:10px;vertical-align:middle">
      <table role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="width:36px;height:36px;background:${MAIL.mark};border-radius:10px;text-align:center;vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;line-height:36px;color:#ffffff">✝</td>
        </tr>
      </table>
    </td>
    <td style="vertical-align:middle;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;letter-spacing:-0.02em;color:${MAIL.ink}">Portal da Catequese<br/><span style="font-size:12px;font-weight:500;color:${MAIL.muted}">Cristo Rei da Paz</span></td>
  </tr>
</table>`;
}

export function mailButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 8px">
  <tr>
    <td style="border-radius:12px;background:${MAIL.button}">
      <a href="${e(href)}" target="_blank" rel="noopener"
        style="display:inline-block;padding:14px 28px;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;font-weight:600;color:${MAIL.buttonText};text-decoration:none;border-radius:12px">
        ${e(label)}
      </a>
    </td>
  </tr>
</table>`;
}

export function mailOtpBoxes(code: string): string {
  const digits = code.replace(/\D/g, "").padEnd(6, "•").slice(0, 6).split("");
  const cells = digits
    .map(
      (d) =>
        `<td style="width:44px;height:52px;text-align:center;vertical-align:middle;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:700;color:${MAIL.ink};background:${MAIL.accentSoft};border:1px solid ${MAIL.border};border-radius:10px">${e(d)}</td>`,
    )
    .join('<td style="width:8px"></td>');

  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px auto"><tr>${cells}</tr></table>`;
}

export function mailLayout(opts: {
  preview: string;
  title: string;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const year = new Date().getFullYear();
  const footer =
    opts.footerNote ??
    "Recebeu este email porque tem actividade no Portal da Catequese. Se não reconhece, ignore.";

  return `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <title>${e(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${MAIL.bg};font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${MAIL.ink}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(opts.preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${MAIL.bg};padding:40px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px">
          <tr>
            <td style="height:4px;border-radius:16px 16px 0 0;background:${MAIL.mark};font-size:0;line-height:0">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:${MAIL.card};border:1px solid ${MAIL.border};border-top:none;border-radius:0 0 16px 16px;padding:36px 40px 40px;box-shadow:0 12px 40px rgba(26,35,50,0.06)">
              ${mailBrandLogo()}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 28px">
                <tr><td style="height:1px;background:${MAIL.border};font-size:0;line-height:0">&nbsp;</td></tr>
              </table>
              <h1 style="margin:0 0 20px;font-size:24px;font-weight:600;line-height:1.3;letter-spacing:-0.02em;color:${MAIL.ink}">${e(opts.title)}</h1>
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 12px 0;text-align:center">
              <p style="margin:0 0 8px;font-size:12px;line-height:1.65;color:${MAIL.muted}">${e(footer)}</p>
              <p style="margin:0;font-size:11px;color:${MAIL.muted}">© ${year} Paróquia Cristo Rei da Paz · Luanda</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${MAIL.ink}">${text}</p>`;
}

export function muted(text: string): string {
  return `<p style="margin:0 0 12px;font-size:13px;line-height:1.65;color:${MAIL.muted}">${text}</p>`;
}

export function highlightBox(html: string): string {
  return `<div style="margin:20px 0;padding:16px 18px;background:${MAIL.accentSoft};border:1px solid ${MAIL.border};border-left:3px solid ${MAIL.accent};border-radius:12px;font-size:14px;line-height:1.65;color:${MAIL.ink}">${html}</div>`;
}
