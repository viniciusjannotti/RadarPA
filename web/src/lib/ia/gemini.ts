import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { MensagemIA } from "@/lib/ia/pedido";

// gemini-2.0-flash foi desligado em 01/06/2026; troque por GEMINI_MODEL sem novo deploy de código.
const MODELO_PADRAO = "gemini-3.5-flash";
const TIMEOUT_MS = 45_000;

export class IANaoConfiguradaError extends Error {}

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
 * retornar texto (ex.: bloqueio de segurança).
 */
export async function gerarTexto(instrucao: string, mensagens: MensagemIA[]): Promise<string | null> {
  const resposta = await getCliente().models.generateContent({
    model: process.env.GEMINI_MODEL || MODELO_PADRAO,
    contents: mensagens.map((m) => ({ role: m.papel, parts: [{ text: m.texto }] })),
    config: {
      systemInstruction: instrucao,
      temperature: 0.3,
      // Folgado: nos modelos com "thinking" o raciocínio também consome este limite.
      maxOutputTokens: 8192,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    },
  });
  return resposta.text?.trim() || null;
}
