import { describe, expect, it } from "vitest";

import { UniqueId } from "../../../shared/domain/unique-id.js";
import { Session } from "./session.js";

const now = new Date("2026-10-13T10:00:00.000Z");
const DAY = 86_400_000;

function start() {
  return Session.start({ accountId: UniqueId.create(), tokenHash: "h", now, ttlDays: 30 });
}

describe("Session", () => {
  it("expira ao fim do prazo", () => {
    const session = start();
    expect(session.isActive(new Date(now.getTime() + 29 * DAY))).toBe(true);
    expect(session.isActive(new Date(now.getTime() + 30 * DAY))).toBe(false);
  });

  it("deixa de estar ativa quando revogada", () => {
    const session = start();
    session.revoke(now);
    expect(session.isActive(now)).toBe(false);
    expect(session.wasRotated).toBe(false);
  });

  it("guarda a sessão que a substituiu na rotação", () => {
    const session = start();
    const next = UniqueId.create();
    session.revoke(now, next);
    expect(session.wasRotated).toBe(true);
    expect(session.replacedById?.equals(next)).toBe(true);
  });

  it("revogar duas vezes mantém a primeira data", () => {
    const session = start();
    session.revoke(now);
    session.revoke(new Date(now.getTime() + DAY));
    expect(session.revokedAt).toEqual(now);
  });
});
