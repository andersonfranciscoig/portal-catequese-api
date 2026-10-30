import { describe, expect, it } from "vitest";

import { AppConfig } from "../../../config/app-config.js";
import * as T from "../templates/index.js";
import { MailService } from "./mail.service.js";
import { MailPort, type SendMailInput } from "./ports/mail.port.js";

const BRAND: T.MailBrand = {
  portalUrl: "https://catequese.exemplo.ao",
  contactEmail: "catequese@exemplo.ao",
};

class RecordingPort extends MailPort {
  readonly sent: SendMailInput[] = [];
  async send(input: SendMailInput) {
    this.sent.push(input);
  }
}

function service() {
  const port = new RecordingPort();
  const config = new AppConfig({
    DATABASE_URL: "postgresql://localhost/teste",
    JWT_ACCESS_SECRET: "x".repeat(40),
    FRONTEND_URL: "https://catequese.exemplo.ao/",
    EMAIL_REPLY_TO: "secretaria@exemplo.ao",
  });
  return { port, mail: new MailService(port, config) };
}

describe("Templates de email", () => {
  it("escapam o que vem de formulários (títulos, nomes e mensagens)", () => {
    const rendered = T.portalAnnouncement(BRAND, {
      firstName: "<b>Ana</b>",
      title: "Reunião <script>alert(1)</script>",
      body: 'Sábado às 10h.\n\nTragam "a Bíblia" & o caderno.',
      audienceLabel: "Encarregado de educação",
      publishedAt: new Date("2026-10-21T09:00:00Z"),
      linkUrl: "https://catequese.exemplo.ao/portal/catequese",
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("Reunião &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(rendered.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    // Os parágrafos do aviso mantêm-se.
    expect(rendered.html).toContain("Sábado às 10h.</p>");
    expect(rendered.html).toContain("Tragam &quot;a Bíblia&quot; &amp; o caderno.");
    expect(rendered.html).toContain("21 de outubro de 2026");
    expect(rendered.subject).toBe("Aviso: Reunião <script>alert(1)</script>");
    expect(rendered.text).toContain('Tragam "a Bíblia" & o caderno.');
    expect(rendered.text).toContain("Ver no portal: https://catequese.exemplo.ao/portal/catequese");
  });

  it("todos têm HTML completo, versão em texto e o contacto da paróquia", () => {
    const all = [
      T.authVerifyOtp(BRAND, { firstName: "Ana", otp: "482913", expiresMinutes: 10 }),
      T.authPasswordReset(BRAND, {
        firstName: "Ana",
        resetUrl: "https://catequese.exemplo.ao/recuperar?token=abc",
        expiresMinutes: 60,
      }),
      T.authPasswordChanged(BRAND, { firstName: "Ana" }),
      T.authWelcome(BRAND, {
        firstName: "Ana",
        roleLabel: "Encarregado de educação",
        portalUrl: "https://catequese.exemplo.ao/portal",
      }),
      T.portalNotification(BRAND, { firstName: "Ana", title: "Matrícula confirmada" }),
      T.attendanceRollReminder(BRAND, {
        firstName: "Ana",
        classLabel: "Comunhão · 3.º ano · A",
        dayLabel: "sábado, 25/10",
        linkUrl: "https://catequese.exemplo.ao/portal/presencas?turma=x&data=2026-10-25",
      }),
      T.attendancePendingRollsDigest(BRAND, {
        firstName: "Ana",
        items: [
          { classLabel: "Comunhão · 3.º ano · A", dayLabel: "sábado, 25/10", catechists: ["Rui"] },
          { classLabel: "Crisma · 1.º ano · B", dayLabel: "domingo, 26/10", catechists: [] },
        ],
        linkUrl: "https://catequese.exemplo.ao/dashboard/presencas?data=2026-10-26",
      }),
    ];
    for (const rendered of all) {
      expect(rendered.subject.length).toBeGreaterThan(5);
      expect(rendered.html).toMatch(/^<!DOCTYPE html>/);
      expect(rendered.html).toContain("Paróquia Cristo Rei da Paz");
      expect(rendered.html).toContain("mailto:catequese@exemplo.ao");
      expect(rendered.text).toContain("https://catequese.exemplo.ao · catequese@exemplo.ao");
    }
    expect(all[0].subject).toBe("482913 é o seu código do Portal da Catequese");
    expect(all[0].text).toContain("482913");
    expect(all[1].html).toContain("válida durante <strong>1 hora</strong>");
    expect(all[5].subject).toBe("Chamada por lançar: sábado, 25/10");
    expect(all[5].text).toContain(
      "Ainda não lançaste a chamada do encontro de sábado, 25/10, da turma Comunhão · 3.º ano · A.",
    );
    expect(all[6].subject).toBe("2 chamadas por lançar");
    expect(all[6].text).toContain("- domingo, 26/10 · Crisma · 1.º ano · B (Sem catequista)");
  });
});

describe("MailService", () => {
  it("usa o endereço do portal e o contacto configurados", () => {
    const { port, mail } = service();
    mail.sendAnnouncement({
      email: "ana@exemplo.ao",
      firstName: "Ana",
      title: "Reunião de pais",
      body: "Sábado, depois da catequese.",
      audienceLabel: "Encarregado de educação",
      publishedAt: new Date(),
      link: "/portal/catequese",
    });
    mail.sendPasswordReset({ email: "ana+1@exemplo.ao", firstName: "Ana", token: "a b" });
    const [announcement, reset] = port.sent;
    expect(announcement).toMatchObject({
      to: { email: "ana@exemplo.ao", name: "Ana" },
      subject: "Aviso: Reunião de pais",
      tags: ["portal.announcement"],
    });
    expect(announcement.html).toContain('href="https://catequese.exemplo.ao/portal/catequese"');
    expect(announcement.html).toContain("mailto:secretaria@exemplo.ao");
    expect(reset.text).toContain(
      "https://catequese.exemplo.ao/recuperar?token=a%20b&email=ana%2B1%40exemplo.ao",
    );
  });
});
