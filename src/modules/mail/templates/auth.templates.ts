import {
  callout,
  e,
  fallbackLink,
  greeting,
  mailButton,
  mailCode,
  mailLayout,
  muted,
  paragraph,
  plainText,
  type MailBrand,
  type RenderedEmail,
} from "./layout.js";

/** Código para confirmar o email ao criar a conta. */
export function authVerifyOtp(
  brand: MailBrand,
  props: { firstName: string; otp: string; expiresMinutes: number },
): RenderedEmail {
  return {
    subject: `${props.otp} é o seu código do Portal da Catequese`,
    html: mailLayout({
      brand,
      preview: `Use ${props.otp} para confirmar o seu email. Válido durante ${props.expiresMinutes} minutos.`,
      eyebrow: "Confirmação de email",
      title: "Confirme o seu email",
      bodyHtml: `
        ${greeting(props.firstName)}
        ${paragraph("Está quase! Introduza este código no portal para concluir a criação da sua conta.")}
        ${mailCode(props.otp)}
        ${muted(`O código é válido durante <strong>${props.expiresMinutes} minutos</strong> e só pode ser usado uma vez. Nunca o partilhe: ninguém da paróquia lho vai pedir.`)}
        ${callout("Não pediu este código? Pode ignorar este email; sem o código, ninguém consegue usar o seu endereço.", "info")}
      `,
      footerNote:
        "Recebeu este email porque alguém usou este endereço para criar uma conta no Portal da Catequese.",
    }),
    text: plainText(brand, [
      `Olá, ${props.firstName}.`,
      "",
      `O seu código do Portal da Catequese é: ${props.otp}`,
      `É válido durante ${props.expiresMinutes} minutos e só pode ser usado uma vez.`,
      "",
      "Não pediu este código? Pode ignorar este email.",
    ]),
  };
}

/** Ligação para escolher uma nova palavra-passe. */
export function authPasswordReset(
  brand: MailBrand,
  props: { firstName: string; resetUrl: string; expiresMinutes: number },
): RenderedEmail {
  const hours = props.expiresMinutes >= 60 && props.expiresMinutes % 60 === 0;
  const validity = hours
    ? `${props.expiresMinutes / 60} ${props.expiresMinutes === 60 ? "hora" : "horas"}`
    : `${props.expiresMinutes} minutos`;
  return {
    subject: "Redefinir a palavra-passe do Portal da Catequese",
    html: mailLayout({
      brand,
      preview: `Escolha uma nova palavra-passe. A ligação é válida durante ${validity}.`,
      eyebrow: "Segurança da conta",
      title: "Redefinir a palavra-passe",
      bodyHtml: `
        ${greeting(props.firstName)}
        ${paragraph("Recebemos um pedido para redefinir a palavra-passe da sua conta. Carregue no botão para escolher uma nova.")}
        ${mailButton(props.resetUrl, "Escolher nova palavra-passe")}
        ${muted(`A ligação é válida durante <strong>${validity}</strong> e só pode ser usada uma vez.`)}
        ${fallbackLink(props.resetUrl)}
        ${callout("Não foi você? Ignore este email: a sua palavra-passe atual continua a funcionar.", "info")}
      `,
      footerNote:
        "Recebeu este email porque foi pedida a recuperação da palavra-passe desta conta.",
    }),
    text: plainText(brand, [
      `Olá, ${props.firstName}.`,
      "",
      "Recebemos um pedido para redefinir a palavra-passe da sua conta.",
      `Escolha uma nova aqui (válido durante ${validity}):`,
      props.resetUrl,
      "",
      "Não foi você? Ignore este email: a sua palavra-passe atual continua a funcionar.",
    ]),
  };
}

/** Aviso de segurança depois de mudar a palavra-passe. */
export function authPasswordChanged(
  brand: MailBrand,
  props: { firstName: string; changedAt?: Date },
): RenderedEmail {
  const when = (props.changedAt ?? new Date()).toLocaleString("pt-PT", {
    timeZone: "Africa/Luanda",
    dateStyle: "long",
    timeStyle: "short",
  });
  return {
    subject: "A sua palavra-passe foi alterada",
    html: mailLayout({
      brand,
      preview: "Confirmamos que a palavra-passe da sua conta foi alterada.",
      eyebrow: "Segurança da conta",
      title: "Palavra-passe alterada",
      bodyHtml: `
        ${greeting(props.firstName)}
        ${callout(`A palavra-passe da sua conta foi alterada a <strong>${e(when)}</strong>.`, "success")}
        ${paragraph("A partir de agora, entre no portal com a nova palavra-passe.")}
        ${callout("<strong>Não foi você?</strong> Recupere já o acesso em “Esqueci-me da palavra-passe” e avise a secretaria da catequese.", "warning")}
        ${mailButton(`${brand.portalUrl}/entrar`, "Entrar no portal")}
      `,
      footerNote:
        "Enviamos este aviso sempre que a palavra-passe de uma conta muda, por segurança.",
    }),
    text: plainText(brand, [
      `Olá, ${props.firstName}.`,
      "",
      `A palavra-passe da sua conta foi alterada a ${when}.`,
      "Não foi você? Recupere já o acesso em “Esqueci-me da palavra-passe” e avise a secretaria da catequese.",
    ]),
  };
}

/** Boas-vindas depois de criar a conta. */
export function authWelcome(
  brand: MailBrand,
  props: { firstName: string; portalUrl: string; roleLabel: string },
): RenderedEmail {
  const steps = [
    ["Matrículas", "inscreva os educandos e acompanhe cada pedido."],
    ["Avisos", "receba as novidades da coordenação no portal e por email."],
    ["Calendário", "veja os encontros, as celebrações e as reuniões."],
  ];
  const list = steps
    .map(
      ([title, text]) =>
        `<tr><td width="22" style="vertical-align:top;padding:6px 0;font-size:15px;line-height:1.6;color:#c9a54d">&#10003;</td><td style="padding:6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#33405a" class="body"><strong style="color:#16213a" class="ink">${title}</strong> — ${text}</td></tr>`,
    )
    .join("");
  return {
    subject: "Bem-vindo(a) ao Portal da Catequese",
    html: mailLayout({
      brand,
      preview: `A sua conta de ${props.roleLabel} está pronta.`,
      eyebrow: "Conta criada",
      title: "Bem-vindo(a) ao Portal da Catequese",
      bodyHtml: `
        ${greeting(props.firstName)}
        ${paragraph(`A sua conta de <strong>${e(props.roleLabel)}</strong> está pronta. É um gosto tê-lo(a) connosco na caminhada da catequese.`)}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 8px">${list}</table>
        ${mailButton(props.portalUrl, "Ir para o portal")}
      `,
    }),
    text: plainText(brand, [
      `Olá, ${props.firstName}.`,
      "",
      `A sua conta de ${props.roleLabel} está pronta.`,
      "No portal pode fazer matrículas, receber os avisos da coordenação e ver o calendário.",
      "",
      `Entrar: ${props.portalUrl}`,
    ]),
  };
}
