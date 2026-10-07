import Link from "next/link";
import { formatData, formatHora, tipoCurto } from "@/lib/format";
import type { SessaoResumo } from "@/lib/sessoes";

export function SessaoCard({ sessao }: { sessao: SessaoResumo }) {
  const extraordinaria = /extraordin/i.test(sessao.tipo);
  return (
    <Link href={`/sessoes/${sessao.id}`} className="card-link p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {formatData(sessao.dataInicio)} · {formatHora(sessao.dataInicio)}
          </p>
          <h3 className="mt-1 font-semibold leading-snug">
            {sessao.numero}ª {tipoCurto(sessao.tipo)} de {sessao.ano}
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            extraordinaria ? "bg-accent-2-soft text-accent-2" : "bg-accent-soft text-accent"
          }`}
        >
          {tipoCurto(sessao.tipo)}
        </span>
      </div>
      {sessao.status !== "Encerrada" && (
        <p className="mt-2 text-xs text-muted">Status: {sessao.status}</p>
      )}
    </Link>
  );
}

export function SessaoCardSkeleton() {
  return (
    <div className="card p-4" aria-hidden>
      <div className="skeleton h-3 w-28" />
      <div className="skeleton mt-2 h-5 w-56" />
    </div>
  );
}
