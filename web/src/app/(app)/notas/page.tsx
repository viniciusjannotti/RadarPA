import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { NotaCard } from "@/components/notas/NotaCard";
import { requirePageSession } from "@/lib/auth/session";
import { listNotasComTotal } from "@/lib/notas";
import { isTipoAlvo, type TipoAlvo } from "@/lib/notas-validacao";
import { firstParam } from "@/lib/search-params";

export const metadata: Metadata = { title: "Minhas notas" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTROS: { tipo?: TipoAlvo; label: string }[] = [
  { label: "Todas" },
  { tipo: "vereador", label: "Vereadores" },
  { tipo: "sessao", label: "Sessões" },
  { tipo: "proposicao", label: "Proposições" },
];

export default function NotasPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Minhas notas</h1>
      <p className="mt-1 text-sm text-muted">
        Para criar uma nota, abra um vereador, uma sessão ou uma proposição.
      </p>
      <Suspense fallback={<Skeleton />}>
        <Lista searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Lista({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  await requirePageSession();
  const raw = firstParam(await searchParams, "tipo");
  const tipo = isTipoAlvo(raw) ? raw : undefined;
  const { notas, total } = await listNotasComTotal({ tipoAlvo: tipo });

  return (
    <>
      <nav aria-label="Filtrar notas" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTROS.map((f) => (
          <Link
            key={f.label}
            href={f.tipo ? `/notas?tipo=${f.tipo}` : "/notas"}
            aria-current={f.tipo === tipo ? "page" : undefined}
            className={`chip shrink-0 ${f.tipo === tipo ? "chip-active" : ""}`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {total > notas.length && (
        <p className="mt-4 text-xs text-muted">
          Mostrando as {notas.length} notas mais recentes de {total.toLocaleString("pt-BR")}. As demais
          continuam na página de cada vereador, sessão ou proposição.
        </p>
      )}
      {notas.length === 0 ? (
        <p className="card mt-4 p-5 text-sm text-muted">Nenhuma nota{tipo ? " deste tipo" : ""} ainda.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notas.map((n) => (
            <li key={n.id}>
              <NotaCard nota={n} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div className="mt-4 space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-28" />
      ))}
    </div>
  );
}
