import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Avatar } from "@/components/Avatar";
import { requirePageSession } from "@/lib/auth/session";
import { formatData, formatDataCivil } from "@/lib/format";
import { getVereador } from "@/lib/vereadores";

const GWLEGIS = "https://cmpousoalegre.gwlegis.com.br";

export default function VereadorPage({ params }: PageProps<"/vereadores/[id]">) {
  return (
    <>
      <Link
        href="/vereadores"
        className="inline-flex min-h-11 items-center text-sm text-muted hover:text-fg"
      >
        ← Vereadores
      </Link>
      <Suspense fallback={<PerfilSkeleton />}>
        <Perfil params={params} />
      </Suspense>
    </>
  );
}

async function Perfil({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requirePageSession();
  const { id } = await params;
  const v = /^\d{1,9}$/.test(id) ? await getVereador(Number(id)) : null;
  if (!v) notFound();

  return (
    <article className="mt-2">
      <header className="flex items-center gap-4">
        <Avatar nome={v.nomeParlamentar} fotoUrl={v.fotoUrl} size={88} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{v.nomeParlamentar}</h1>
          <p className="mt-0.5 text-muted">{v.partido}</p>
          {v.cargoMesa && (
            <span className="mt-2 inline-block rounded-full bg-accent-2-soft px-2.5 py-1 text-[11px] font-semibold text-accent-2">
              {v.cargoMesa}
            </span>
          )}
        </div>
      </header>

      <dl className="card mt-5 divide-y divide-line text-sm">
        {v.email && (
          <Linha label="E-mail">
            <a href={`mailto:${v.email}`} className="break-all text-accent hover:underline">
              {v.email}
            </a>
          </Linha>
        )}
        {v.legislatura && (
          <Linha label="Mandato">
            {formatDataCivil(v.legislatura.inicio)} – {formatDataCivil(v.legislatura.fim)}
          </Linha>
        )}
        <Linha label="Situação">{v.status === "ativo" ? "Em exercício" : v.status}</Linha>
      </dl>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Comissões</h2>
        {v.comissoes.length === 0 ? (
          <p className="card mt-3 p-4 text-sm text-muted">Não integra comissões permanentes.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {v.comissoes.map((c) => (
              <li key={c.id} className="card flex items-center gap-3 p-3">
                <span className="grid h-9 min-w-12 place-items-center rounded-lg bg-accent-soft px-2 text-xs font-bold text-accent">
                  {c.sigla}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug">{c.nome}</span>
                {c.cargo !== "membro" && (
                  <span className="text-xs capitalize text-muted">{c.cargo}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {v.gwlegisId && (
        <a
          className="chip mt-6"
          href={`${GWLEGIS}/vereador/${v.gwlegisId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver no portal da Câmara ↗
        </a>
      )}
      <p className="mt-6 text-xs text-muted">Fonte: GWLegis · coletado em {formatData(v.coletadoEm)}</p>
    </article>
  );
}

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function PerfilSkeleton() {
  return (
    <div className="mt-2 space-y-4" aria-hidden>
      <div className="flex items-center gap-4">
        <div className="skeleton size-22 rounded-full" />
        <div className="space-y-2">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-24" />
        </div>
      </div>
      <div className="skeleton h-36" />
    </div>
  );
}
