import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { VereadorResumo } from "@/lib/vereadores";

export function VereadorCard({ vereador }: { vereador: VereadorResumo }) {
  return (
    <Link href={`/vereadores/${vereador.id}`} className="card-link flex items-center gap-4 p-3 pr-4">
      <Avatar nome={vereador.nomeParlamentar} fotoUrl={vereador.fotoUrl} />
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 font-semibold leading-snug">{vereador.nomeParlamentar}</h3>
        <p className="text-sm text-muted">{vereador.partido}</p>
      </div>
      {vereador.cargoMesa && (
        <span className="shrink-0 rounded-full bg-accent-2-soft px-2.5 py-1 text-[11px] font-semibold text-accent-2">
          {vereador.cargoMesa}
        </span>
      )}
    </Link>
  );
}

export function VereadorCardSkeleton() {
  return (
    <div className="card flex items-center gap-4 p-3" aria-hidden>
      <div className="skeleton size-14 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-40" />
        <div className="skeleton h-3 w-24" />
      </div>
    </div>
  );
}
