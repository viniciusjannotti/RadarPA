import { NotaCard } from "@/components/notas/NotaCard";
import { NovaNotaForm } from "@/components/notas/NovaNotaForm";
import { notasDoAlvo } from "@/lib/notas";
import type { TipoAlvo } from "@/lib/notas-validacao";

/** Seção "Minhas notas" das páginas de vereador, sessão e proposição.
 *  Renderizar dentro de um componente que já chamou connection() + requirePageSession(). */
export async function NotasDoAlvo({ tipoAlvo, alvoId }: { tipoAlvo: TipoAlvo; alvoId: number }) {
  const notas = await notasDoAlvo(tipoAlvo, alvoId);
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-note">Minhas notas</h2>
      <div className="mt-3 space-y-3">
        {notas.map((n) => (
          <NotaCard key={n.id} nota={n} />
        ))}
        <NovaNotaForm tipoAlvo={tipoAlvo} alvoId={alvoId} />
      </div>
    </section>
  );
}
