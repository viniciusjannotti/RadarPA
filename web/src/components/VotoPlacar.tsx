import type { Placar } from "@/lib/votacoes";

/** Barra proporcional favoráveis / contrários / demais (ausências, não votou). */
export function VotoPlacar({ placar }: { placar: Placar }) {
  const total = placar.sim + placar.nao + placar.outros;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");
  return (
    <div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-surface-strong"
        role="img"
        aria-label={`${placar.sim} favoráveis, ${placar.nao} contrários, ${placar.outros} demais`}
      >
        <span className="bg-accent-2" style={{ width: pct(placar.sim) }} />
        <span className="bg-danger" style={{ width: pct(placar.nao) }} />
        <span className="bg-muted/40" style={{ width: pct(placar.outros) }} />
      </div>
      <div className="mt-1.5 flex gap-4 text-xs tabular-nums text-muted">
        <span>
          <b className="text-accent-2">{placar.sim}</b> sim
        </span>
        <span>
          <b className="text-danger">{placar.nao}</b> não
        </span>
        {placar.outros > 0 && <span>{placar.outros} ausências/abstenções</span>}
      </div>
    </div>
  );
}

export function ResultadoBadge({ resultado }: { resultado: string | null }) {
  if (!resultado) return null;
  const aprovado = /aprovad/i.test(resultado);
  const rejeitado = /rejeitad/i.test(resultado);
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        aprovado
          ? "bg-accent-2-soft text-accent-2"
          : rejeitado
            ? "bg-danger/15 text-danger"
            : "bg-surface-strong text-muted"
      }`}
    >
      {resultado}
    </span>
  );
}
