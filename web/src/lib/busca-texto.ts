// Normalização compartilhada da Busca. O coletor grava proposicoes.busca do mesmo jeito
// (collectors/collector_proposicoes.py, texto_busca): minúsculo e sem acento.

const MAX_CONSULTA = 100;
const MAX_TERMOS = 5;

export function normalizarConsulta(q: string): string {
  return q
    .slice(0, MAX_CONSULTA * 4) // corta antes de normalizar: entrada gigante não custa nada
    .replace(/[\p{Cc}\p{Cf}]/gu, " ") // NUL e afins: o Postgres rejeita NUL em texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CONSULTA);
}

/** Palavras da consulta (todas precisam aparecer, em qualquer ordem). */
export function termosDaConsulta(q: string): string[] {
  return q
    .split(" ")
    .filter((t) => t.length >= 2)
    .slice(0, MAX_TERMOS);
}

/** "8412/2026" ou "8412": busca direta pelo número da proposição. */
export function numeroDaConsulta(q: string): { numero: number; ano?: number } | null {
  const m = /^(\d{1,6})(?:\/(\d{4}))?$/.exec(q);
  if (!m) return null;
  return m[2] ? { numero: Number(m[1]), ano: Number(m[2]) } : { numero: Number(m[1]) };
}

/** Escapa %, _ e \ para que o texto digitado seja literal num LIKE ... ESCAPE '\'. */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
