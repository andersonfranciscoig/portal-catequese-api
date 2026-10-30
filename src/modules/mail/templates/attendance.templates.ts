import {
  callout,
  details,
  e,
  greeting,
  mailButton,
  mailLayout,
  muted,
  paragraph,
  plainText,
  type MailBrand,
  type RenderedEmail,
} from "./layout.js";

/** Ao catequista: a chamada de um encontro ainda não foi lançada (prazo: fim do dia). */
export function attendanceRollReminder(
  brand: MailBrand,
  props: {
    firstName: string;
    /** "Comunhão · 3.º ano · A" */
    classLabel: string;
    /** "sábado, 25/10" */
    dayLabel: string;
    linkUrl: string;
  },
): RenderedEmail {
  const sentence = `Ainda não lançaste a chamada do encontro de ${props.dayLabel}, da turma ${props.classLabel}.`;
  return {
    subject: `Chamada por lançar: ${props.dayLabel}`,
    html: mailLayout({
      brand,
      preview: sentence,
      eyebrow: "Presenças",
      title: "Falta lançar a chamada",
      bodyHtml: `
        ${greeting(props.firstName)}
        ${paragraph(e(sentence))}
        ${details([
          ["Turma", props.classLabel],
          ["Encontro", props.dayLabel],
        ])}
        ${callout("O prazo é o fim do dia do encontro. Lança-a assim que possível: as famílias e a coordenação contam com estes registos.", "warning")}
        ${mailButton(props.linkUrl, "Lançar a chamada")}
      `,
      footerNote:
        "Recebeu este email por ser catequista desta turma no Portal da Catequese. O aviso fica também no sino e nas mensagens do portal.",
    }),
    text: plainText(brand, [
      `Olá, ${props.firstName}.`,
      "",
      sentence,
      "Lança-a assim que possível.",
      "",
      `Lançar a chamada: ${props.linkUrl}`,
    ]),
  };
}

/** À coordenação: os encontros que passaram o prazo sem chamada nesta verificação. */
export function attendancePendingRollsDigest(
  brand: MailBrand,
  props: {
    firstName: string;
    items: { classLabel: string; dayLabel: string; catechists: string[] }[];
    linkUrl: string;
  },
): RenderedEmail {
  const count = props.items.length;
  const title = count === 1 ? "1 chamada por lançar" : `${count} chamadas por lançar`;
  const rows = props.items.map((item): [string, string] => [
    `${item.dayLabel} · ${item.classLabel}`,
    item.catechists.length ? item.catechists.join(", ") : "Sem catequista",
  ]);
  return {
    subject: title,
    html: mailLayout({
      brand,
      preview: `${title}: ${props.items.map((item) => item.classLabel).join(", ")}`,
      eyebrow: "Presenças",
      title,
      bodyHtml: `
        ${greeting(props.firstName)}
        ${paragraph(
          count === 1
            ? "Este encontro terminou o dia sem a chamada lançada. Os catequistas da turma já foram avisados."
            : "Estes encontros terminaram o dia sem a chamada lançada. Os catequistas já foram avisados.",
        )}
        ${details(rows)}
        ${muted("Encontro e turma · catequistas")}
        ${mailButton(props.linkUrl, "Ver as presenças")}
      `,
      footerNote: "Recebeu este resumo por ter acesso à coordenação no Portal da Catequese.",
    }),
    text: plainText(brand, [
      `Olá, ${props.firstName}.`,
      "",
      `${title}:`,
      ...rows.map(([what, who]) => `- ${what} (${who})`),
      "",
      `Ver as presenças: ${props.linkUrl}`,
    ]),
  };
}
