"use server";

import { refresh } from "next/cache";
import { hasValidSession } from "@/lib/auth/session";
import { apagarNota, criarNota, editarNota } from "@/lib/notas";
import { NotaError, validarNovaNota, validarTextoNota } from "@/lib/notas-validacao";

export type NotaState = { ok?: true; error?: string } | undefined;

const SEM_SESSAO: NotaState = { error: "Sua sessão expirou. Entre de novo para salvar a nota." };

function idDe(formData: FormData): number | null {
  const raw = String(formData.get("id") ?? "");
  return /^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

// Só erros esperados (NotaError, lançados por lib/notas) mostram a mensagem na tela;
// qualquer outra coisa vira mensagem genérica. O log leva só nome/código: a mensagem
// de um erro do Prisma pode conter o texto da nota.
async function executar(fn: () => Promise<unknown>): Promise<NotaState> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof NotaError) return { error: err.message };
    const e = err as { name?: string; code?: string };
    console.error("[notas] falha ao gravar:", e?.name ?? "Error", e?.code ?? "");
    return { error: "Não foi possível salvar. Tente de novo." };
  }
  refresh();
  return { ok: true };
}

// Server Functions são endpoints públicos: cada uma verifica a sessão por conta própria.
export async function criarNotaAction(_prev: NotaState, formData: FormData): Promise<NotaState> {
  if (!(await hasValidSession())) return SEM_SESSAO;
  const v = validarNovaNota({
    tipoAlvo: formData.get("tipoAlvo"),
    alvoId: formData.get("alvoId"),
    texto: formData.get("texto"),
  });
  if (!v.ok) return { error: v.error };
  return executar(() => criarNota(v.nota));
}

export async function editarNotaAction(_prev: NotaState, formData: FormData): Promise<NotaState> {
  if (!(await hasValidSession())) return SEM_SESSAO;
  const id = idDe(formData);
  const t = validarTextoNota(formData.get("texto"));
  if (id === null) return { error: "Nota inválida." };
  if (!t.ok) return { error: t.error };
  return executar(() => editarNota(id, t.texto));
}

export async function apagarNotaAction(_prev: NotaState, formData: FormData): Promise<NotaState> {
  if (!(await hasValidSession())) return SEM_SESSAO;
  const id = idDe(formData);
  if (id === null) return { error: "Nota inválida." };
  return executar(() => apagarNota(id));
}
