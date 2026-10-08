"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { apagarNotaAction, editarNotaAction, type NotaState } from "@/lib/notas-actions";
import { MAX_TEXTO_NOTA } from "@/lib/notas-validacao";

type Nota = {
  id: number;
  texto: string;
  criadoEm: Date;
  atualizadoEm: Date;
  alvo?: { rotulo: string; href: string | null };
};

const dataFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function NotaCard({ nota }: { nota: Nota }) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [editState, editar, salvando] = useActionState(
    async (prev: NotaState, formData: FormData) => {
      const r = await editarNotaAction(prev, formData);
      if (r?.ok) setEditando(false); // fecha o editor só quando salvou
      return r;
    },
    undefined,
  );
  const [apagarState, apagar, apagando] = useActionState(apagarNotaAction, undefined);

  const editada = nota.atualizadoEm.getTime() - nota.criadoEm.getTime() > 1000;
  const erro = editState?.error ?? apagarState?.error;

  return (
    <article className="card border-l-4 border-l-note p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-note-soft px-2.5 py-0.5 text-[11px] font-semibold text-note">
          Nota pessoal
        </span>
        {nota.alvo &&
          (nota.alvo.href ? (
            <Link href={nota.alvo.href} className="text-xs text-accent hover:underline">
              {nota.alvo.rotulo}
            </Link>
          ) : (
            <span className="text-xs text-muted">{nota.alvo.rotulo}</span>
          ))}
        <span className="ml-auto text-[11px] text-muted">
          {dataFmt.format(nota.criadoEm)}
          {editada ? " · editada" : ""}
        </span>
      </div>

      {editando ? (
        <form action={editar} className="mt-3">
          <input type="hidden" name="id" value={nota.id} />
          <label htmlFor={`nota-${nota.id}`} className="sr-only">
            Editar nota
          </label>
          <textarea
            id={`nota-${nota.id}`}
            name="texto"
            required
            rows={3}
            maxLength={MAX_TEXTO_NOTA}
            defaultValue={nota.texto}
            autoFocus
            className="block w-full resize-y rounded-lg border border-line bg-surface-strong p-3 text-sm text-fg outline-none focus:border-note focus:ring-2 focus:ring-note/30"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(false)} className="chip">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="min-h-11 rounded-full bg-note px-4 text-sm font-semibold text-bg disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{nota.texto}</p>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {erro}
        </p>
      )}

      {!editando && (
        <div className="mt-3 flex justify-end gap-2">
          {confirmando ? (
            <form action={apagar} className="flex items-center gap-2">
              <input type="hidden" name="id" value={nota.id} />
              <span className="text-xs text-muted">Apagar esta nota?</span>
              <button type="button" onClick={() => setConfirmando(false)} className="chip">
                Não
              </button>
              <button
                type="submit"
                disabled={apagando}
                className="min-h-11 rounded-full bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {apagando ? "Apagando…" : "Apagar"}
              </button>
            </form>
          ) : (
            <>
              <button type="button" onClick={() => setEditando(true)} className="chip">
                Editar
              </button>
              <button type="button" onClick={() => setConfirmando(true)} className="chip hover:text-danger">
                Apagar
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
