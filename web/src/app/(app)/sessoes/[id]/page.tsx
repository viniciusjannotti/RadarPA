import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { requirePageSession } from "@/lib/auth/session";
import { formatData, formatDiaSemana, formatHora, tipoCurto } from "@/lib/format";
import { safeExternalUrl } from "@/lib/safe-url";
import { getSessao } from "@/lib/sessoes";
import { getPresencasDaSessao, getVotacoesDaSessao } from "@/lib/votacoes";
import { VotacaoItem } from "@/components/VotacaoItem";

const GWLEGIS = "https://cmpousoalegre.gwlegis.com.br";

export default function SessaoPage({ params }: PageProps<"/sessoes/[id]">) {
  return (
    <>
      <Link href="/sessoes" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-fg">
        ← Sessões
      </Link>
      <Suspense fallback={<DetalheSkeleton />}>
        <SessaoDetalhe params={params} />
      </Suspense>
    </>
  );
}

function duracao(inicio: Date, fim: Date | null): string | null {
  if (!fim) return null;
  const min = Math.round((fim.getTime() - inicio.getTime()) / 60000);
  if (min <= 0) return null;
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}

async function SessaoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requirePageSession();
  const { id } = await params;
  const sessao = /^\d{1,9}$/.test(id) ? await getSessao(Number(id)) : null;
  if (!sessao) notFound();

  const dur = duracao(sessao.dataInicio, sessao.dataFim);
  const ataUrl = safeExternalUrl(sessao.ataUrl);
  const [presencas, votacoes] = await Promise.all([
    getPresencasDaSessao(sessao.id),
    getVotacoesDaSessao(sessao.id),
  ]);

  return (
    <article className="mt-2">
      <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
        {tipoCurto(sessao.tipo)}
      </span>
      <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight">
        {sessao.numero}ª {tipoCurto(sessao.tipo)} de {sessao.ano}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {formatDiaSemana(sessao.dataInicio)}, {formatData(sessao.dataInicio)}
      </p>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        <Info label="Início" valor={formatHora(sessao.dataInicio)} />
        <Info label="Término" valor={formatHora(sessao.dataFim)} />
        <Info label="Duração" valor={dur ?? "—"} />
      </dl>

      <div className="card mt-3 flex items-center justify-between p-4 text-sm">
        <span className="text-muted">Status</span>
        <span className="font-medium">{sessao.status}</span>
      </div>

      {presencas.total > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Presença</h2>
          <div className="card mt-3 p-4">
            <p className="text-sm">
              <b className="text-lg tabular-nums">{presencas.presentes}</b>
              <span className="text-muted"> de {presencas.total} vereadores presentes</span>
              {presencas.pendentes > 0 && (
                <span className="text-muted"> · {presencas.pendentes} com registro pendente</span>
              )}
            </p>
            {presencas.ausentes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {presencas.ausentes.map((a) => (
                  <Link
                    key={a.id}
                    href={`/vereadores/${a.id}`}
                    className="rounded-full bg-danger/10 px-2.5 py-1 text-xs text-danger"
                  >
                    {a.nomeParlamentar}
                    {a.situacao === "JUSTIFICADO" ? " (justificado)" : " (ausente)"}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          Votações {votacoes.length > 0 && `(${votacoes.length})`}
        </h2>
        {votacoes.length === 0 ? (
          <p className="card mt-3 p-4 text-sm text-muted">
            {sessao.ano >= 2026
              ? "Boletim de votação ainda não disponível para esta sessão."
              : "O portal só publica boletins de votação a partir de 2026."}
          </p>
        ) : (
          <ol className="mt-3 space-y-3">
            {votacoes.map((v) => (
              <li key={v.id}>
                <VotacaoItem votacao={v} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        {sessao.gwlegisId && (
          <a
            className="chip"
            href={`${GWLEGIS}/sessao-plenaria/${sessao.gwlegisId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver no portal da Câmara ↗
          </a>
        )}
        {ataUrl && (
          <a className="chip" href={ataUrl} target="_blank" rel="noopener noreferrer">
            Ata ↗
          </a>
        )}
      </div>

      <p className="mt-6 text-xs text-muted">
        Fonte: GWLegis · coletado em {formatData(sessao.coletadoEm)}{" "}
        {formatHora(sessao.coletadoEm)}
      </p>
    </article>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="card p-3 text-center">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

function DetalheSkeleton() {
  return (
    <div className="mt-2 space-y-3" aria-hidden>
      <div className="skeleton h-6 w-24 rounded-full" />
      <div className="skeleton h-8 w-72" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-20" />
        ))}
      </div>
    </div>
  );
}
