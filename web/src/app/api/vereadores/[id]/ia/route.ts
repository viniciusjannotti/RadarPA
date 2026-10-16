import { json, requireApiSession } from "@/lib/api";
import { montarContexto } from "@/lib/ia/contexto-vereador";
import { gerarTexto, iaConfigurada } from "@/lib/ia/gemini";
import { parsePedidoIA, type MensagemIA } from "@/lib/ia/pedido";
import {
  instrucaoComDados,
  PEDIDO_DIVERGENTES,
  PEDIDO_RESUMO,
  PROMPT_CHAT,
  PROMPT_DIVERGENTES,
  PROMPT_RESUMO,
} from "@/lib/ia/prompts";

// Acima do timeout de 45 s do gemini.ts, para o erro sair como JSON e não como 504 da plataforma.
export const maxDuration = 60;

// POST (não GET): cada chamada custa cota da API e não deve ser disparada por prefetch.
export async function POST(request: Request, ctx: RouteContext<"/api/vereadores/[id]/ia">) {
  const denied = await requireApiSession();
  if (denied) return denied;

  if (!iaConfigurada()) {
    return json({ error: "Análise com IA não configurada (GEMINI_API_KEY)." }, { status: 503 });
  }

  const { id } = await ctx.params;
  if (!/^\d{1,9}$/.test(id)) return json({ error: "ID inválido" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = parsePedidoIA(body);
  if (!parsed.ok) return json({ error: parsed.error }, { status: 400 });
  const { pedido } = parsed;

  const contexto = await montarContexto(Number(id));
  if (!contexto) return json({ error: "Vereador não encontrado" }, { status: 404 });

  let prompt: string;
  let mensagens: MensagemIA[];
  switch (pedido.modo) {
    case "resumo":
      prompt = PROMPT_RESUMO;
      mensagens = [{ papel: "user", texto: PEDIDO_RESUMO }];
      break;
    case "divergentes":
      prompt = PROMPT_DIVERGENTES;
      mensagens = [{ papel: "user", texto: PEDIDO_DIVERGENTES }];
      break;
    case "chat":
      prompt = PROMPT_CHAT;
      mensagens = [...pedido.historico, { papel: "user", texto: pedido.pergunta }];
      break;
  }

  try {
    const texto = await gerarTexto(instrucaoComDados(prompt, contexto), mensagens);
    if (!texto) return json({ error: "A IA não devolveu resposta. Tente reformular." }, { status: 502 });
    return json({ texto });
  } catch (err) {
    console.error("[ia] falha ao gerar:", (err as Error).message);
    return json({ error: "Falha ao consultar a IA. Tente novamente." }, { status: 502 });
  }
}
