import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { MensagemIA } from "@/lib/ia/pedido";

// gemini-2.0-flash foi desligado em 01/06/2026; troque por GEMINI_MODEL sem novo deploy de código.
const MODELO_PADRAO = "gemini-3.5-flash";
// Reserva mais leve para quando o principal responde "high demand" (comum na cota gratuita).
const MODELO_RESERVA = "gemini-3.5-flash-lite";
// Total para todas as tentativas; abaixo do maxDuration (60 s) da rota.
const TIMEOUT_MS = 50_000;
const STATUS_SOBRECARGA = new Set([429, 500, 503]);

export class IANaoConfiguradaError extends Error {}
export class IASobrecarregadaError extends Error {}

let cliente: GoogleGenAI | null = null;

function getCliente(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new IANaoConfiguradaError("GEMINI_API_KEY não configurada");
  cliente ??= new GoogleGenAI({ apiKey });
  return cliente;
}

export function iaConfigurada(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Gera texto com o Gemini. `instrucao` vai como system instruction; `mensagens`
 * é a conversa (a última deve ser do usuário). Devolve null se o modelo não
 * retornar texto (ex.: bloqueio de segurança). Se o modelo principal estiver
 * sobrecarregado, tenta o reserva; se ambos estiverem, lança IASobrecarregadaError.
 */
export async function gerarTexto(instrucao: string, mensagens: MensagemIA[]): Promise<string | null> {
  const cliente = getCliente();
  const modelos = [
    process.env.GEMINI_MODEL || MODELO_PADRAO,
    process.env.GEMINI_MODEL_FALLBACK || MODELO_RESERVA,
  ];
  const abortSignal = AbortSignal.timeout(TIMEOUT_MS);
  const contents = mensagens.map((m) => ({ role: m.papel, parts: [{ text: m.texto }] }));

  for (const model of modelos) {
    try {
      const resposta = await cliente.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: instrucao,
          temperature: 0.3,
          // Folgado: nos modelos com "thinking" o raciocínio também consome este limite.
          maxOutputTokens: 8192,
          abortSignal,
        },
      });
      return resposta.text?.trim() || null;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === undefined || !STATUS_SOBRECARGA.has(status)) throw err;
      console.warn(`[ia] ${model} sobrecarregado (${status}); tentando o próximo.`);
    }
  }
  throw new IASobrecarregadaError("Todos os modelos sobrecarregados");
}
