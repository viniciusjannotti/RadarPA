import { describe, expect, it } from "vitest";
import { proximaOrdinariaPrevista } from "@/lib/proxima-sessao";

// Ordinárias são às terças; o horário vem da última ordinária realizada.
const ultimaOrdinaria = new Date("2026-10-06T19:00:00Z"); // terça 06/10, 16:00 em São Paulo

describe("proximaOrdinariaPrevista", () => {
  it("de uma quinta, aponta a terça seguinte no mesmo horário (fuso de São Paulo)", () => {
    const quinta = new Date("2026-10-08T21:00:00Z"); // 18:00 SP
    expect(proximaOrdinariaPrevista(quinta, ultimaOrdinaria).toISOString()).toBe(
      "2026-10-13T19:00:00.000Z",
    );
  });

  it("numa terça antes do horário, é a de hoje; depois do horário, a da semana seguinte", () => {
    const tercaManha = new Date("2026-10-13T12:00:00Z"); // 09:00 SP
    const tercaNoite = new Date("2026-10-13T23:30:00Z"); // 20:30 SP
    expect(proximaOrdinariaPrevista(tercaManha, ultimaOrdinaria).toISOString()).toBe(
      "2026-10-13T19:00:00.000Z",
    );
    expect(proximaOrdinariaPrevista(tercaNoite, ultimaOrdinaria).toISOString()).toBe(
      "2026-10-20T19:00:00.000Z",
    );
  });

  it("segunda à noite em SP já é terça em UTC: continua apontando a terça certa", () => {
    const segundaNoiteSP = new Date("2026-10-13T02:30:00Z"); // seg 12/10 23:30 SP
    expect(proximaOrdinariaPrevista(segundaNoiteSP, ultimaOrdinaria).toISOString()).toBe(
      "2026-10-13T19:00:00.000Z",
    );
  });

  it("usa o horário da última ordinária (ex.: 18:00)", () => {
    const as18 = new Date("2026-08-25T21:00:00Z"); // terça 18:00 SP
    const sexta = new Date("2026-08-28T15:00:00Z");
    expect(proximaOrdinariaPrevista(sexta, as18).toISOString()).toBe("2026-09-01T21:00:00.000Z");
  });
});
