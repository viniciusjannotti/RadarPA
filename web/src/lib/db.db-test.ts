import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe("banco de teste", () => {
  it("tem a extensão pg_trgm instalada", async () => {
    const rows = await db.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
    expect(rows).toHaveLength(1);
  });

  it("lê timestamptz gravado por outro cliente sem deslocar o fuso", async () => {
    // Regressão: com o servidor em America/Sao_Paulo (o Postgres de teste sobe assim),
    // o adapter-pg lia 16:00Z em vez de 19:00Z.
    await db.$executeRaw`
      INSERT INTO sessoes (numero, ano, tipo, data_inicio, fonte_url)
      VALUES (36, 2026, 'Sessão Ordinária', '2026-10-06 16:00:00-03', 'x')`;
    const s = await db.sessao.findFirstOrThrow();
    expect(s.dataInicio.toISOString()).toBe("2026-10-06T19:00:00.000Z");
  });

  it("grava e lê uma sessão", async () => {
    await db.sessao.create({
      data: {
        numero: 36,
        ano: 2026,
        tipo: "Sessão Ordinária",
        dataInicio: new Date("2026-10-06T19:00:00Z"),
        fonteUrl: "https://example.test/x",
      },
    });
    expect(await db.sessao.count()).toBe(1);
  });
});
