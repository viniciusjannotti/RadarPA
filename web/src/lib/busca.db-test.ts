import { describe, expect, it } from "vitest";
import { buscar } from "@/lib/busca";
import { normalizarConsulta } from "@/lib/busca-texto";
import { db } from "@/lib/db";

async function seed() {
  const prop = (titulo: string, numero: number, ementa: string | null, data: string) =>
    db.proposicao.create({
      data: {
        tipo: titulo.split(" Nº")[0],
        numero,
        ano: Number(titulo.slice(-4)),
        titulo,
        ementa,
        dataProtocolo: new Date(data),
        // O coletor grava a mesma normalização (collector_proposicoes.texto_busca).
        busca: normalizarConsulta(`${titulo} ${ementa ?? ""}`),
        fonteUrl: "x",
      },
    });
  await prop("Projeto de Lei Nº 8412/2026", 8412, "DISPÕE SOBRE O COMBATE AO ASSÉDIO MORAL", "2026-07-23");
  await prop("Indicação Nº 100/2026", 100, "Pede poda de árvores no bairro São João", "2026-05-01");
  await prop("Moção Nº 8412/2025", 8412, "Aplauso ao 100% de vacinação", "2025-03-01");
  await db.vereador.create({
    data: { nome: "Dionísio Ailton Pereira", nomeParlamentar: "Dionísio", partido: "REPUBLICANOS", fonteUrl: "x" },
  });
  await db.sessao.create({
    data: {
      numero: 36,
      ano: 2026,
      tipo: "Sessão Ordinária",
      titulo: "36ª Sessão Ordinária de 06/10/2026",
      dataInicio: new Date("2026-10-06T19:00:00Z"),
      fonteUrl: "x",
    },
  });
}

describe("buscar", () => {
  it("acha proposição pela ementa sem acento e com várias palavras fora de ordem", async () => {
    await seed();
    const r = await buscar("assedio combate");
    expect(r.proposicoes.items.map((p) => p.titulo)).toEqual(["Projeto de Lei Nº 8412/2026"]);
  });

  it("número/ano acha a proposição exata; só o número acha todas com esse número", async () => {
    await seed();
    expect((await buscar("8412/2026")).proposicoes.items.map((p) => p.titulo)).toEqual([
      "Projeto de Lei Nº 8412/2026",
    ]);
    expect((await buscar("8412")).proposicoes.total).toBe(2);
  });

  it("acha vereador por nome parlamentar, nome civil ou partido, sem acento", async () => {
    await seed();
    expect((await buscar("dionisio")).vereadores.map((v) => v.nomeParlamentar)).toEqual(["Dionísio"]);
    expect((await buscar("ailton")).vereadores).toHaveLength(1);
    expect((await buscar("republicanos")).vereadores).toHaveLength(1);
  });

  it("acha sessão pela data ou pelo tipo sem acento", async () => {
    await seed();
    expect((await buscar("06/10/2026")).sessoes.map((s) => s.numero)).toEqual([36]);
    expect((await buscar("sessao ordinaria")).sessoes).toHaveLength(1);
  });

  it("curingas digitados não viram 'casa tudo'", async () => {
    await seed();
    const r = await buscar("%_%");
    expect(r.proposicoes.total).toBe(0);
    expect((await buscar("100%")).proposicoes.items.map((p) => p.titulo)).toEqual(["Moção Nº 8412/2025"]);
  });

  it("consulta curta devolve vazio sem consultar", async () => {
    await seed();
    const r = await buscar(" a ");
    expect(r.consulta).toBe("");
    expect(r.proposicoes.total + r.sessoes.length + r.vereadores.length).toBe(0);
  });
});

describe("buscar (robustez)", () => {
  it("NUL na consulta não derruba a busca", async () => {
    await seed();
    const r = await buscar("assedio\u0000");
    expect(r.proposicoes.items.map((p) => p.titulo)).toEqual(["Projeto de Lei Nº 8412/2026"]);
  });
});
