export const TIPOS_ALVO = ["vereador", "sessao", "proposicao"] as const;
export type TipoAlvo = (typeof TIPOS_ALVO)[number];
export const MAX_TEXTO_NOTA = 5000;

type Resultado<T> = { ok: true } & T | { ok: false; error: string };

/** Erro esperado (ex.: alvo inexistente) cuja mensagem pode ir para a tela. */
export class NotaError extends Error {
  override name = "NotaError";
}

export function isTipoAlvo(v: unknown): v is TipoAlvo {
  return typeof v === "string" && (TIPOS_ALVO as readonly string[]).includes(v);
}

export function validarTextoNota(raw: unknown): Resultado<{ texto: string }> {
  // NUL: o Postgres recusa em colunas de texto. Surrogate solto: não é texto válido.
  const texto = typeof raw === "string" ? raw.replaceAll("\u0000", "").trim() : "";
  if (!texto.isWellFormed()) return { ok: false, error: "A nota tem caracteres inválidos." };
  if (!texto) return { ok: false, error: "Escreva alguma coisa na nota." };
  if (texto.length > MAX_TEXTO_NOTA) {
    return { ok: false, error: `A nota passou de ${MAX_TEXTO_NOTA.toLocaleString("pt-BR")} caracteres.` };
  }
  return { ok: true, texto };
}

export function validarNovaNota(input: {
  tipoAlvo: unknown;
  alvoId: unknown;
  texto: unknown;
}): Resultado<{ nota: { tipoAlvo: TipoAlvo; alvoId: number; texto: string } }> {
  if (!isTipoAlvo(input.tipoAlvo)) return { ok: false, error: "Tipo de alvo inválido." };
  const id = String(input.alvoId ?? "");
  if (!/^\d{1,9}$/.test(id) || Number(id) <= 0) return { ok: false, error: "Alvo inválido." };
  const texto = validarTextoNota(input.texto);
  if (!texto.ok) return texto;
  return { ok: true, nota: { tipoAlvo: input.tipoAlvo, alvoId: Number(id), texto: texto.texto } };
}
