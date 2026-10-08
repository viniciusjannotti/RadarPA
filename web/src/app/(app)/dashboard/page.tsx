import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { requirePageSession } from "@/lib/auth/session";
import { getDashboard, type Dashboard } from "@/lib/dashboard";
import { formatData, formatDiaSemana, formatHora, tipoCurto } from "@/lib/format";
import { siteUrl } from "@/lib/safe-url";

export const metadata: Metadata = { title: "Início" };

const ATALHOS = [
  { href: "/vereadores", label: "Vereadores", icon: "👥" },
  { href: "/sessoes", label: "Sessões", icon: "📋" },
  { href: "/busca", label: "Busca", icon: "🔍" },
  { href: "/notas", label: "Notas", icon: "📝" },
] as const;

const COLETOR_LABEL: Record<string, string> = {
  collector_sessoes: "sessões",
  collector_vereadores: "vereadores",
  collector_votacoes: "votações",
  collector_proposicoes: "proposições",
  collector_noticias: "notícias",
};

export default function DashboardPage() {
  return (
    <>
      <h1 className="sr-only">Início</h1>
      <Suspense fallback={<Skeleton />}>
        <Conteudo />
      </Suspense>
      <nav aria-label="Atalhos" className="mt-6 grid grid-cols-2 gap-3">
        {ATALHOS.map((a) => (
          <Link key={a.href} href={a.href} className="card-link flex items-center gap-3 p-4">
            <span aria-hidden className="text-2xl">
              {a.icon}
            </span>
            <span className="font-medium">{a.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

async function Conteudo() {
  await connection();
  await requirePageSession();
  const d = await getDashboard();

  return (
    <div className="space-y-4">
      <ProximaSessao proxima={d.proximaSessao} />
      <UltimaSessao sessao={d.ultimaSessao} />

      <section className="card p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Novidades</h2>
        <p className="mt-2 text-sm">
          <b className="text-lg tabular-nums">{d.novidades.proposicoesSemana.toLocaleString("pt-BR")}</b>
          <span className="text-muted"> proposições protocoladas nos últimos 7 dias</span>
        </p>
        <Link href="/busca" className="mt-1 inline-flex min-h-11 items-center text-sm text-accent">
          Buscar proposições →
        </Link>
      </section>

      {d.noticias.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Notícias da Câmara</h2>
          <ul className="mt-3 space-y-2">
            {d.noticias.map((n) => {
              const href = siteUrl(n.url);
              const corpo = (
                <>
                  {n.dataPublicacao && (
                    <span className="block text-[11px] text-muted">{formatData(n.dataPublicacao)}</span>
                  )}
                  <span className="text-sm leading-snug">{n.titulo}</span>
                </>
              );
              return (
                <li key={n.id}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="card-link block p-3">
                      {corpo}
                    </a>
                  ) : (
                    <div className="card p-3">{corpo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Coleta coleta={d.coleta} />
    </div>
  );
}

function ProximaSessao({ proxima }: { proxima: Dashboard["proximaSessao"] }) {
  if (!proxima) return null;
  return (
    <section className="card relative overflow-hidden p-5">
      <span
        aria-hidden
        className="absolute -right-10 -top-10 size-36 rounded-full border border-accent-2/20 shadow-[0_0_60px_-10px_var(--accent-2)]"
      />
      <h2 className="text-xs font-semibold uppercase tracking-wide text-accent-2">
        Próxima sessão {proxima.confirmada ? "" : "(prevista)"}
      </h2>
      <p className="mt-2 text-2xl font-bold tracking-tight">
        {formatDiaSemana(proxima.data)}, {formatData(proxima.data)}
      </p>
      <p className="text-muted">às {formatHora(proxima.data)}</p>
      {!proxima.confirmada && (
        <p className="mt-2 text-xs text-muted">
          Estimativa pelo padrão das ordinárias (terças); recessos e mudanças de agenda não entram.
        </p>
      )}
      {proxima.sessaoId && (
        <Link href={`/sessoes/${proxima.sessaoId}`} className="mt-2 inline-flex min-h-11 items-center text-sm text-accent">
          Ver sessão →
        </Link>
      )}
    </section>
  );
}

function UltimaSessao({ sessao }: { sessao: Dashboard["ultimaSessao"] }) {
  if (!sessao) {
    return <p className="card p-5 text-sm text-muted">Nenhuma sessão coletada ainda.</p>;
  }
  return (
    <Link href={`/sessoes/${sessao.id}`} className="card-link block p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Última sessão</h2>
      <p className="mt-2 text-lg font-semibold">
        {sessao.numero}ª {tipoCurto(sessao.tipo)} de {sessao.ano}
      </p>
      <p className="text-sm text-muted">
        {formatData(sessao.dataInicio)} · {formatHora(sessao.dataInicio)}–{formatHora(sessao.dataFim)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-muted">Matérias votadas</dt>
          <dd className="text-2xl font-bold tabular-nums">{sessao.votacoes}</dd>
        </div>
        {sessao.totalPresenca > 0 && (
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted">Presentes</dt>
            <dd className="text-2xl font-bold tabular-nums">
              {sessao.presentes}
              <span className="text-base font-normal text-muted">/{sessao.totalPresenca}</span>
            </dd>
          </div>
        )}
      </dl>
    </Link>
  );
}

function Coleta({ coleta }: { coleta: Dashboard["coleta"] }) {
  if (!coleta.ultimaAtualizacao) return null;
  return (
    <p className="text-xs text-muted">
      Dados atualizados em {formatData(coleta.ultimaAtualizacao)} às {formatHora(coleta.ultimaAtualizacao)}.
      {coleta.comProblema.length > 0 && (
        <span className="text-danger">
          {" "}
          Última coleta com falha: {coleta.comProblema.map((c) => COLETOR_LABEL[c] ?? c).join(", ")}.
        </span>
      )}
    </p>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="skeleton h-36" />
      <div className="skeleton h-40" />
      <div className="skeleton h-24" />
    </div>
  );
}
