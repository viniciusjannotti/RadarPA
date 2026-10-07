import Link from "next/link";
import { ResultadoBadge, VotoPlacar } from "@/components/VotoPlacar";
import { VOTO_LABEL, type VotacaoDetalhe } from "@/lib/votacoes";

export function VotacaoItem({ votacao }: { votacao: VotacaoDetalhe }) {
  const grupos = Map.groupBy(votacao.votos, (v) => v.voto);
  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {votacao.ordem !== null && (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Item {votacao.ordem}
              {votacao.tipoAprovacao ? ` · ${votacao.tipoAprovacao}` : ""}
            </p>
          )}
          <h3 className="mt-0.5 font-semibold leading-snug">{votacao.descricao}</h3>
          {votacao.autoria && <p className="mt-0.5 text-sm text-muted">Autoria: {votacao.autoria}</p>}
        </div>
        <ResultadoBadge resultado={votacao.resultado} />
      </div>

      {votacao.assunto && (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg/85">{votacao.assunto}</p>
      )}

      {votacao.votos.length > 0 && (
        <>
          <div className="mt-3">
            <VotoPlacar placar={votacao.placar} />
          </div>
          <details className="group mt-3">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-accent">
              <span className="group-open:hidden">Ver votos nominais</span>
              <span className="hidden group-open:inline">Ocultar votos nominais</span>
            </summary>
            <dl className="space-y-2 text-sm">
              {[...grupos].map(([voto, lista]) => (
                <div key={voto}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {VOTO_LABEL[voto] ?? voto} ({lista.length})
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {lista.map((v) => (
                      <Link
                        key={v.vereadorId}
                        href={`/vereadores/${v.vereadorId}`}
                        className="rounded-full border border-line px-2.5 py-1 text-xs hover:border-accent/50"
                      >
                        {v.nomeParlamentar}
                      </Link>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      )}
    </article>
  );
}
