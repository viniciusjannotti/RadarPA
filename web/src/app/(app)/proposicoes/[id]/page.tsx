import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ResultadoBadge } from "@/components/VotoPlacar";
import { requirePageSession } from "@/lib/auth/session";
import { formatData, formatDataCivil } from "@/lib/format";
import { getProposicao } from "@/lib/proposicoes";
import { portalUrl } from "@/lib/safe-url";

const GWLEGIS = "https://cmpousoalegre.gwlegis.com.br";

export default function ProposicaoPage({ params }: PageProps<"/proposicoes/[id]">) {
  return (
    <Suspense fallback={<Skeleton />}>
      <Detalhe params={params} />
    </Suspense>
  );
}

async function Detalhe({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requirePageSession();
  const { id } = await params;
  const p = /^\d{1,9}$/.test(id) ? await getProposicao(Number(id)) : null;
  if (!p) notFound();

  const anexo = portalUrl(p.link);

  return (
    <article>
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
          {p.tipo}
        </span>
        <ResultadoBadge resultado={p.status} />
      </div>
      <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight">{p.titulo}</h1>
      {p.dataProtocolo && (
        <p className="mt-1 text-sm text-muted">Protocolada em {formatDataCivil(p.dataProtocolo)}</p>
      )}

      {p.ementa ? (
        <p className="card mt-5 p-4 text-sm leading-relaxed">{p.ementa}</p>
      ) : (
        <p className="card mt-5 p-4 text-sm text-muted">Sem ementa no portal.</p>
      )}

      {p.autores.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Autoria</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.autores.map((a) => (
              <Link key={a.id} href={`/vereadores/${a.id}`} className="chip">
                {a.nomeParlamentar} · {a.partido}
              </Link>
            ))}
          </div>
        </section>
      )}

      {p.votacoes.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Votações</h2>
          <ul className="mt-3 space-y-2">
            {p.votacoes.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/sessoes/${v.sessaoId}`}
                  className="card-link flex items-center justify-between gap-3 p-3"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] text-muted">{formatData(v.data)}</span>
                    <span className="line-clamp-2 text-sm">{v.descricao}</span>
                  </span>
                  <ResultadoBadge resultado={v.resultado} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {p.gwlegisId && (
          <a
            className="chip"
            href={`${GWLEGIS}/proposicao/${p.gwlegisId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver no portal da Câmara ↗
          </a>
        )}
        {anexo && (
          <a className="chip" href={anexo} target="_blank" rel="noopener noreferrer">
            Anexo ↗
          </a>
        )}
      </div>
    </article>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="skeleton h-6 w-28 rounded-full" />
      <div className="skeleton h-8 w-72" />
      <div className="skeleton h-28" />
    </div>
  );
}
