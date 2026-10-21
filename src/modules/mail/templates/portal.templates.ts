import {
  details,
  greeting,
  mailButton,
  mailLayout,
  paragraph,
  paragraphs,
  plainText,
  quote,
  type MailBrand,
  type RenderedEmail,
} from "./layout.js";

/** Notificação do sino enviada também por email (ex.: matrícula confirmada). */
export function portalNotification(
  brand: MailBrand,
  props: { firstName: string; title: string; body?: string; linkUrl?: string },
): RenderedEmail {
  return {
    subject: props.title,
    html: mailLayout({
      brand,
      preview: props.body ?? props.title,
      eyebrow: "Novidade no portal",
      title: props.title,
      bodyHtml: `
        ${greeting(props.firstName)}
        ${props.body ? paragraphs(props.body) : paragraph("Há uma novidade para si no Portal da Catequese.")}
        ${props.linkUrl ? mailButton(props.linkUrl, "Ver no portal") : ""}
      `,
      footerNote:
        "Recebeu este email porque tem uma conta no Portal da Catequese. Encontra esta e outras novidades no sino do portal.",
    }),
    text: plainText(brand, [
      `Olá, ${props.firstName}.`,
      "",
      props.title,
      props.body,
      props.linkUrl && "",
      props.linkUrl && `Ver no portal: ${props.linkUrl}`,
    ]),
  };
}

/** Aviso da coordenação (Comunicação), com o texto completo. */
export function portalAnnouncement(
  brand: MailBrand,
  props: {
    firstName: string;
    title: string;
    body: string;
    /** Ex.: "Encarregados de educação". */
    audienceLabel: string;
    publishedAt: Date;
    linkUrl: string;
  },
): RenderedEmail {
  const date = props.publishedAt.toLocaleDateString("pt-PT", {
    timeZone: "Africa/Luanda",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return {
    subject: `Aviso: ${props.title}`,
    html: mailLayout({
      brand,
      preview: props.body.replace(/\s+/g, " ").slice(0, 120),
      eyebrow: "Aviso da coordenação",
      title: props.title,
      bodyHtml: `
        ${greeting(props.firstName)}
        ${paragraph("A coordenação da catequese publicou um aviso para si:")}
        ${quote(paragraphs(props.body))}
        ${details([
          ["Para", props.audienceLabel],
          ["Publicado a", date],
        ])}
        ${mailButton(props.linkUrl, "Ver no portal")}
      `,
      footerNote: `Recebeu este aviso como ${props.audienceLabel.toLowerCase()} do Portal da Catequese. Todos os avisos ficam também na página Catequese do portal.`,
    }),
    text: plainText(brand, [
      `Olá, ${props.firstName}.`,
      "",
      "A coordenação da catequese publicou um aviso para si:",
      "",
      props.title.toUpperCase(),
      props.body,
      "",
      `Para: ${props.audienceLabel} · Publicado a ${date}`,
      `Ver no portal: ${props.linkUrl}`,
    ]),
  };
}
