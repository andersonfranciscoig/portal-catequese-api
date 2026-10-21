import {
  e,
  highlightBox,
  mailButton,
  mailLayout,
  mailOtpBoxes,
  muted,
  paragraph,
  type RenderedEmail,
} from "./layout.js";

export function authVerifyOtp(props: {
  firstName: string;
  otp: string;
  expiresMinutes: number;
}): RenderedEmail {
  const subject = `${props.otp} — código de verificação`;
  const text = `Olá ${props.firstName},\n\nO seu código de verificação é: ${props.otp}\nExpira em ${props.expiresMinutes} minutos.\n\n— Portal da Catequese · Cristo Rei da Paz`;
  const html = mailLayout({
    preview: `Código ${props.otp} para concluir o registo`,
    title: "Verifique o seu email",
    bodyHtml: `
      ${paragraph(`Olá <strong>${e(props.firstName)}</strong>,`)}
      ${paragraph("Use o código abaixo para concluir a criação da sua conta no Portal da Catequese.")}
      ${mailOtpBoxes(props.otp)}
      ${muted(`Este código expira em <strong>${props.expiresMinutes} minutos</strong>. Não o partilhe com ninguém.`)}
      ${highlightBox("Se não pediu este código, pode ignorar este email com segurança.")}
    `,
  });
  return { subject, html, text };
}

export function authPasswordReset(props: {
  firstName: string;
  resetUrl: string;
  expiresMinutes: number;
}): RenderedEmail {
  const subject = "Redefinir a sua palavra-passe";
  const text = `Olá ${props.firstName},\n\nRedefina a palavra-passe: ${props.resetUrl}\n\nExpira em ${props.expiresMinutes} minutos.\n— Portal da Catequese`;
  const html = mailLayout({
    preview: "Link para redefinir palavra-passe",
    title: "Redefinir palavra-passe",
    bodyHtml: `
      ${paragraph(`Olá <strong>${e(props.firstName)}</strong>,`)}
      ${paragraph("Recebemos um pedido para redefinir a palavra-passe da sua conta.")}
      ${mailButton(props.resetUrl, "Redefinir palavra-passe")}
      ${muted(`O link expira em ${props.expiresMinutes} minutos.`)}
      ${highlightBox("Se não fez este pedido, ignore este email. A sua conta permanece segura.")}
    `,
  });
  return { subject, html, text };
}

export function authPasswordChanged(props: { firstName: string }): RenderedEmail {
  const subject = "Palavra-passe alterada com sucesso";
  const text = `Olá ${props.firstName},\n\nA palavra-passe da sua conta foi alterada.\n— Portal da Catequese`;
  const html = mailLayout({
    preview: "Confirmação de alteração de palavra-passe",
    title: "Palavra-passe actualizada",
    bodyHtml: `
      ${paragraph(`Olá <strong>${e(props.firstName)}</strong>,`)}
      ${paragraph("Confirmamos que a palavra-passe da sua conta foi alterada com sucesso.")}
      ${highlightBox("Não foi você? Contacte a secretaria da catequese o mais depressa possível.")}
    `,
  });
  return { subject, html, text };
}

export function authWelcome(props: {
  firstName: string;
  portalUrl: string;
  roleLabel: string;
}): RenderedEmail {
  const subject = "Bem-vindo(a) ao Portal da Catequese";
  const text = `Olá ${props.firstName},\n\nA sua conta de ${props.roleLabel} está pronta. Aceda: ${props.portalUrl}\n— Portal da Catequese`;
  const html = mailLayout({
    preview: "A sua conta está pronta",
    title: "Bem-vindo(a)",
    bodyHtml: `
      ${paragraph(`Olá <strong>${e(props.firstName)}</strong>,`)}
      ${paragraph(`A sua conta de <strong>${e(props.roleLabel)}</strong> foi criada com sucesso.`)}
      ${paragraph("Já pode acompanhar matrículas, avisos e o calendário da catequese.")}
      ${mailButton(props.portalUrl, "Ir para o portal")}
    `,
  });
  return { subject, html, text };
}

export function portalNotification(props: {
  firstName: string;
  title: string;
  body?: string;
  linkUrl?: string;
}): RenderedEmail {
  const subject = props.title;
  const text = `Olá ${props.firstName},\n\n${props.title}${props.body ? `\n${props.body}` : ""}${props.linkUrl ? `\n\n${props.linkUrl}` : ""}\n— Portal da Catequese`;
  const html = mailLayout({
    preview: props.title,
    title: props.title,
    bodyHtml: `
      ${paragraph(`Olá <strong>${e(props.firstName)}</strong>,`)}
      ${props.body ? paragraph(e(props.body)) : ""}
      ${props.linkUrl ? mailButton(props.linkUrl, "Abrir no portal") : ""}
    `,
  });
  return { subject, html, text };
}
