"use client";

import { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { MAX_PERGUNTA, type MensagemIA } from "@/lib/ia/pedido";

type Modo = "resumo" | "divergentes";

// Os overrides só repassam `children`: o react-markdown também envia `node`, que não pode ir ao DOM.
const secao: Components["h2"] = ({ children }) => (
  <h3 className="mt-5 border-b border-line pb-1 text-base font-bold first:mt-0">{children}</h3>
);
const md: Components = {
  h1: secao,
  h2: secao,
  h3: ({ children }) => <h4 className="mt-3 font-semibold">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  p: ({ children }) => <p className="mt-2 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
  // Links vindos do modelo não são seguidos: mostra só o texto.
  a: ({ children }) => <span className="underline decoration-dotted">{children}</span>,
};

async function pedir(vereadorId: number, body: object): Promise<string> {
  const res = await fetch(`/api/vereadores/${vereadorId}/ia`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { texto?: string; error?: string };
  if (!res.ok || !data.texto) throw new Error(data.error ?? "Falha ao consultar a IA.");
  return data.texto;
}

export function AnaliseIA({ vereadorId }: { vereadorId: number }) {
  const [analises, setAnalises] = useState<Partial<Record<Modo, string>>>({});
  const [aberta, setAberta] = useState<Modo | null>(null);
  const [conversa, setConversa] = useState<MensagemIA[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [carregando, setCarregando] = useState<Modo | "chat" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function analisar(modo: Modo) {
    setAberta(modo);
    if (analises[modo] || carregando) return;
    setErro(null);
    setCarregando(modo);
    try {
      const texto = await pedir(vereadorId, { modo });
      setAnalises((a) => ({ ...a, [modo]: texto }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(null);
    }
  }

  async function perguntar(e: React.FormEvent) {
    e.preventDefault();
    const p = pergunta.trim();
    if (!p || carregando) return;
    setErro(null);
    setCarregando("chat");
    try {
      // Só as últimas trocas vão como histórico (o servidor limita o tamanho).
      const texto = await pedir(vereadorId, { modo: "chat", pergunta: p, historico: conversa.slice(-10) });
      setConversa((c) => [...c, { papel: "user", texto: p }, { papel: "model", texto }]);
      setPergunta("");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(null);
    }
  }

  const botao = (modo: Modo, rotulo: string) => (
    <button
      type="button"
      onClick={() => analisar(modo)}
      disabled={carregando !== null}
      aria-pressed={aberta === modo}
      className={`chip disabled:opacity-60 ${aberta === modo ? "border-accent text-accent" : ""}`}
    >
      {carregando === modo ? "Gerando…" : rotulo}
    </button>
  );

  const textoAberto = aberta ? analises[aberta] : undefined;

  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Análise com IA</h2>
      <div className="card mt-3 p-4">
        <div className="flex flex-wrap gap-2">
          {botao("resumo", "Resumo do posicionamento")}
          {botao("divergentes", "Votos contra a maioria")}
        </div>

        {textoAberto && (
          <div className="mt-4 border-t border-line pt-4 text-sm leading-relaxed">
            <Markdown components={md}>{textoAberto}</Markdown>
          </div>
        )}

        {conversa.length > 0 && (
          <ol className="mt-4 space-y-3 border-t border-line pt-4 text-sm leading-relaxed">
            {conversa.map((m, i) => (
              <li
                key={i}
                className={
                  m.papel === "user"
                    ? "ml-8 rounded-lg bg-accent-soft p-3"
                    : "mr-4 rounded-lg bg-surface-strong p-3"
                }
              >
                <span className="sr-only">{m.papel === "user" ? "Você:" : "IA:"}</span>
                {m.papel === "user" ? m.texto : <Markdown components={md}>{m.texto}</Markdown>}
              </li>
            ))}
          </ol>
        )}

        <form onSubmit={perguntar} className="mt-4 flex gap-2">
          <label htmlFor={`pergunta-ia-${vereadorId}`} className="sr-only">
            Pergunta sobre o vereador
          </label>
          <input
            id={`pergunta-ia-${vereadorId}`}
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            maxLength={MAX_PERGUNTA}
            placeholder="Pergunte sobre este vereador…"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface-strong px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <button
            type="submit"
            disabled={carregando !== null || !pergunta.trim()}
            className="min-h-11 shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-60"
          >
            {carregando === "chat" ? "…" : "Perguntar"}
          </button>
        </form>

        <p role="alert" className="mt-2 text-xs text-danger">
          {erro}
        </p>
        <p className="mt-1 text-[11px] text-muted">
          Gerado por IA (Gemini) a partir dos dados públicos coletados — pode conter erros. Confira nas
          fontes.
        </p>
      </div>
    </section>
  );
}
