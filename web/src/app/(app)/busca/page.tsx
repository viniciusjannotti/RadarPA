import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { requirePageSession } from "@/lib/auth/session";
import { buscar } from "@/lib/busca";
import { formatData, formatDataCivil, tipoCurto } from "@/lib/format";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Busca" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function BuscaPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Busca</h1>
      <Suspense fallback={<Formulario valor="" />}>
        <FormularioComValor searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<ResultadosSkeleton />}>
        <Resultados searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function FormularioComValor({ searchParams }: { searchParams: SearchParams }) {
  const q = firstParam(await searchParams, "q") ?? "";
  return <Formulario valor={q} />;
}

function Formulario({ valor }: { valor: string }) {
  return (
    <form action="/busca" method="get" role="search" className="mt-4 flex gap-2">
      <label htmlFor="q" className="sr-only">
        Buscar
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={valor}
        maxLength={100}
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Vereador, palavra da ementa ou 8412/2026"
        className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-surface-strong px-4 text-base text-fg outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="submit"
        className="h-12 shrink-0 rounded-xl bg-accent px-5 font-semibold text-white transition hover:brightness-110"
      >
        Buscar
      </button>
    </form>
  );
}

async function Resultados({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  await requirePageSession();
  const q = firstParam(await searchParams, "q") ?? "";
  const r = await buscar(q);

  if (!r.consulta) {
    return (
      <div className="card mt-5 p-5 text-sm text-muted">
        <p className="font-medium text-fg">O que dá para buscar</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Palavras da ementa: <i>assédio moral</i>, <i>iptu</i> (acentos são opcionais)</li>
          <li>Número da proposição: <i>8412/2026</i> ou só <i>8412</i></li>
          <li>Vereador por nome ou partido</li>
          <li>Sessão pela data: <i>06/10/2026</i></li>
        </ul>
      </div>
    );
  }

  const nada = r.proposicoes.total === 0 && r.vereadores.length === 0 && r.sessoes.length === 0;
  if (nada) {
    return <p className="card mt-5 p-5 text-sm text-muted">Nada encontrado para “{r.consulta}”.</p>;
  }

  return (
    <div className="mt-5 space-y-6">
      {r.vereadores.length > 0 && (
        <Secao titulo="Vereadores" total={r.vereadores.length}>
          {r.vereadores.map((v) => (
            <li key={v.id}>
              <Link href={`/vereadores/${v.id}`} className="card-link flex items-center gap-3 p-3">
                <Avatar nome={v.nomeParlamentar} fotoUrl={v.fotoUrl} size={40} />
                <span className="min-w-0">
                  <span className="block font-medium">{v.nomeParlamentar}</span>
                  <span className="text-xs text-muted">
                    {v.partido}
                    {v.status !== "ativo" ? " · fora do mandato atual" : ""}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </Secao>
      )}

      {r.proposicoes.total > 0 && (
        <Secao titulo="Proposições" total={r.proposicoes.total} mostrando={r.proposicoes.items.length}>
          {r.proposicoes.items.map((p) => (
            <li key={p.id}>
              <Link href={`/proposicoes/${p.id}`} className="card-link block p-3">
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{p.titulo}</span>
                  {p.status && <span className="shrink-0 text-[11px] text-muted">{p.status}</span>}
                </span>
                {p.ementa && <span className="mt-1 line-clamp-2 block text-xs text-muted">{p.ementa}</span>}
                {p.dataProtocolo && (
                  <span className="mt-1 block text-[11px] text-muted">{formatDataCivil(p.dataProtocolo)}</span>
                )}
              </Link>
            </li>
          ))}
        </Secao>
      )}

      {r.sessoes.length > 0 && (
        <Secao titulo="Sessões" total={r.sessoes.length}>
          {r.sessoes.map((s) => (
            <li key={s.id}>
              <Link href={`/sessoes/${s.id}`} className="card-link flex items-center justify-between gap-3 p-3">
                <span className="text-sm font-medium">
                  {s.numero}ª {tipoCurto(s.tipo)} de {s.ano}
                </span>
                <span className="shrink-0 text-xs text-muted">{formatData(s.dataInicio)}</span>
              </Link>
            </li>
          ))}
        </Secao>
      )}
    </div>
  );
}

function Secao({
  titulo,
  total,
  mostrando,
  children,
}: {
  titulo: string;
  total: number;
  mostrando?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        {titulo} ({total.toLocaleString("pt-BR")})
        {mostrando !== undefined && mostrando < total && (
          <span className="font-normal normal-case"> · mostrando as {mostrando} mais recentes</span>
        )}
      </h2>
      <ul className="mt-3 space-y-2">{children}</ul>
    </section>
  );
}

function ResultadosSkeleton() {
  return (
    <div className="mt-5 space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-16" />
      ))}
    </div>
  );
}
