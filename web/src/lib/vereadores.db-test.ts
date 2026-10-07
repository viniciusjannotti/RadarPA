import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getVereador, listVereadores } from "@/lib/vereadores";

async function seed() {
  const leg = await db.legislatura.create({
    data: { numero: 2, inicio: new Date("2025-01-01"), fim: new Date("2028-12-31") },
  });
  const mk = (gwlegisId: number, nomeParlamentar: string, partido: string) =>
    db.vereador.create({
      data: {
        gwlegisId,
        nome: nomeParlamentar,
        nomeParlamentar,
        partido,
        legislaturaId: leg.id,
        fonteUrl: `https://x.test/vereador/${gwlegisId}`,
      },
    });
  const zeca = await mk(1, "Zeca", "PT");
  const ana = await mk(2, "Ana", "PSD");
  const bia = await mk(3, "Bia", "PL");
  const caio = await mk(4, "Caio", "PL");
  await db.mesaDiretora.createMany({
    data: [
      { vereadorId: caio.id, cargo: "1º Secretário(a)", legislaturaId: leg.id, fonteUrl: "x" },
      { vereadorId: zeca.id, cargo: "Presidente", legislaturaId: leg.id, fonteUrl: "x" },
    ],
  });
  const csp = await db.comissao.create({
    data: { gwlegisId: 12, sigla: "CSP", nome: "Comissão de Segurança Pública", fonteUrl: "x" },
  });
  await db.comissaoMembro.create({
    data: { comissaoId: csp.id, vereadorId: ana.id, fonteUrl: "x" },
  });
  return { zeca, ana, bia, caio };
}

describe("listVereadores", () => {
  it("Mesa primeiro, na ordem dos cargos; depois os demais em ordem alfabética", async () => {
    await seed();
    const lista = await listVereadores();
    expect(lista.map((v) => [v.nomeParlamentar, v.cargoMesa])).toEqual([
      ["Zeca", "Presidente"],
      ["Caio", "1º Secretário(a)"],
      ["Ana", null],
      ["Bia", null],
    ]);
  });
});

describe("legislatura atual", () => {
  it("cargo na Mesa de legislatura antiga não aparece; inativos ficam fora da lista", async () => {
    const { zeca, bia } = await seed();
    const antiga = await db.legislatura.create({
      data: { numero: 1, inicio: new Date("2021-01-01"), fim: new Date("2024-12-31") },
    });
    await db.mesaDiretora.create({
      data: { vereadorId: bia.id, cargo: "Presidente", legislaturaId: antiga.id, fonteUrl: "x" },
    });
    await db.vereador.update({ where: { id: zeca.id }, data: { status: "inativo" } });

    const lista = await listVereadores();
    expect(lista.find((v) => v.nomeParlamentar === "Bia")?.cargoMesa).toBeNull();
    expect(lista.some((v) => v.nomeParlamentar === "Zeca")).toBe(false);
    expect((await getVereador(bia.id))?.cargoMesa).toBeNull();
  });
});

describe("getVereador", () => {
  it("traz comissões e cargo na Mesa", async () => {
    const { ana, zeca } = await seed();
    const perfilAna = await getVereador(ana.id);
    expect(perfilAna?.comissoes).toEqual([
      { id: expect.any(Number), sigla: "CSP", nome: "Comissão de Segurança Pública", cargo: "membro" },
    ]);
    expect(perfilAna?.cargoMesa).toBeNull();
    expect((await getVereador(zeca.id))?.cargoMesa).toBe("Presidente");
  });

  it("devolve null para id inexistente ou inválido", async () => {
    expect(await getVereador(999)).toBeNull();
    expect(await getVereador(Number.NaN)).toBeNull();
  });
});
