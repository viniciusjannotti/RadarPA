"use client";

import { useActionState, useEffect, useRef } from "react";
import { criarNotaAction } from "@/lib/notas-actions";
import { MAX_TEXTO_NOTA, type TipoAlvo } from "@/lib/notas-validacao";

export function NovaNotaForm({ tipoAlvo, alvoId }: { tipoAlvo: TipoAlvo; alvoId: number }) {
  const [state, action, pending] = useActionState(criarNotaAction, undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  const id = `nova-nota-${tipoAlvo}-${alvoId}`;
  return (
    <form ref={form} action={action} className="card border-note/30 p-3">
      <input type="hidden" name="tipoAlvo" value={tipoAlvo} />
      <input type="hidden" name="alvoId" value={alvoId} />
      <label htmlFor={id} className="sr-only">
        Nova nota pessoal
      </label>
      <textarea
        id={id}
        name="texto"
        required
        rows={2}
        maxLength={MAX_TEXTO_NOTA}
        placeholder="Escreva uma nota pessoal…"
        aria-describedby={state?.error ? `${id}-erro` : undefined}
        className="block w-full resize-y rounded-lg border border-line bg-surface-strong p-3 text-sm text-fg outline-none placeholder:text-muted focus:border-note focus:ring-2 focus:ring-note/30"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p id={`${id}-erro`} role="alert" className="text-xs text-danger">
          {state?.error}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 shrink-0 rounded-lg bg-note px-4 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Salvando…" : "Salvar nota"}
        </button>
      </div>
    </form>
  );
}
