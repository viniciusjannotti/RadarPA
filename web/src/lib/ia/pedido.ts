export const MAX_PERGUNTA = 500;
export const MAX_HISTORICO = 12;
export const MAX_TEXTO_HISTORICO = 6000;

export type MensagemIA = { papel: "user" | "model"; texto: string };

export type PedidoIA =
  | { modo: "resumo" }
  | { modo: "divergentes" }
  | { modo: "chat"; pergunta: string; historico: MensagemIA[] };

type Resultado = { ok: true; pedido: PedidoIA } | { ok: false; error: string };

const falha = (error: string): Resultado => ({ ok: false, error });

/** Valida o corpo do POST /api/vereadores/[id]/ia. */
export function parsePedidoIA(body: unknown): Resultado {
  if (typeof body !== "object" || body === null) return falha("Corpo inválido");
  const { modo, pergunta, historico } = body as Record<string, unknown>;

  if (modo === "resumo" || modo === "divergentes") return { ok: true, pedido: { modo } };
  if (modo !== "chat") return falha("Modo inválido");

  const p = typeof pergunta === "string" ? pergunta.trim() : "";
  if (!p) return falha("Escreva uma pergunta");
  if (p.length > MAX_PERGUNTA) return falha(`Pergunta com mais de ${MAX_PERGUNTA} caracteres`);

  const h = historico ?? [];
  if (!Array.isArray(h) || h.length > MAX_HISTORICO) return falha("Histórico inválido");
  const mensagens: MensagemIA[] = [];
  for (const m of h) {
    const { papel, texto } = (m ?? {}) as Record<string, unknown>;
    if ((papel !== "user" && papel !== "model") || typeof texto !== "string") {
      return falha("Histórico inválido");
    }
    if (texto.length > MAX_TEXTO_HISTORICO) return falha("Histórico inválido");
    mensagens.push({ papel, texto });
  }
  return { ok: true, pedido: { modo: "chat", pergunta: p, historico: mensagens } };
}
