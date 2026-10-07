import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requirePageSession } from "@/lib/auth/session";
import { SessaoCard, SessaoCardSkeleton } from "@/components/SessaoCard";
import { tipoCurto } from "@/lib/format";
import { firstParam, intParam } from "@/lib/search-params";
import { listSessoes, listTiposSessao } from "@/lib/sessoes";

export const metadata: Metadata = { title: "Sessões" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SessoesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Sessões plenárias</h1>
      <p className="mt-1 text-sm text-muted">Da mais recente para a mais antiga.</p>
      <Suspense fallback={<ListaSkeleton />}>
        <SessoesLista searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function hrefCom(params: { tipo?: string; pg?: number }) {
  const q = new URLSearchParams();
  if (params.tipo) q.set("tipo", params.tipo);
  if (params.pg && params.pg > 1) q.set("pg", String(params.pg));
  const s = q.toString();
  return s ? `/sessoes?${s}` : "/sessoes";
}

async function SessoesLista({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  await requirePageSession();
  const params = await searchParams;
  const tipo = firstParam(params, "tipo");
  const page = intParam(params, "pg");

  const [tipos, { items, total, totalPages, page: atual }] = await Promise.all([
    listTiposSessao(),
    listSessoes({ tipo, page }),
  ]);

  return (
    <>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={hrefCom({})} className={`chip shrink-0 ${!tipo ? "chip-active" : ""}`}>
          Todas
        </Link>
        {tipos.map((t) => (
          <Link
            key={t}
            href={hrefCom({ tipo: t })}
            className={`chip shrink-0 ${tipo === t ? "chip-active" : ""}`}
          >
            {tipoCurto(t)}
          </Link>
        ))}
      </div>

      <p className="mt-4 text-xs text-muted">{total.toLocaleString("pt-BR")} sessões</p>

      {items.length === 0 ? (
        <div className="card mt-3 p-6 text-center text-sm text-muted">
          Nenhuma sessão encontrada. Os dados chegam pelo coletor diário.
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((s) => (
            <li key={s.id}>
              <SessaoCard sessao={s} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-3">
          <PageLink disabled={atual <= 1} href={hrefCom({ tipo, pg: atual - 1 })}>
            ← Anteriores
          </PageLink>
          <span className="text-sm text-muted">
            {atual} / {totalPages}
          </span>
          <PageLink disabled={atual >= totalPages} href={hrefCom({ tipo, pg: atual + 1 })}>
            Próximas →
          </PageLink>
        </nav>
      )}
    </>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="chip opacity-40">{children}</span>;
  }
  return (
    <Link href={href} className="chip">
      {children}
    </Link>
  );
}

function ListaSkeleton() {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-11 w-24 rounded-full" />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((i) => (
        <SessaoCardSkeleton key={i} />
      ))}
    </div>
  );
}
