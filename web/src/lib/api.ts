import "server-only";
import { hasValidSession } from "@/lib/auth/session";

// Respostas da API são do usuário logado: nunca podem ficar em cache compartilhado.
const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

/** Devolve 401 se não houver sessão válida; `null` quando pode seguir. */
export async function requireApiSession(): Promise<Response | null> {
  if (await hasValidSession()) return null;
  return json({ error: "Não autenticado" }, { status: 401 });
}
