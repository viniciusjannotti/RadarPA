import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { VereadorCard, VereadorCardSkeleton } from "@/components/VereadorCard";
import { requirePageSession } from "@/lib/auth/session";
import { listVereadores } from "@/lib/vereadores";

export const metadata: Metadata = { title: "Vereadores" };

export default function VereadoresPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Vereadores</h1>
      <p className="mt-1 text-sm text-muted">Legislatura atual, com a Mesa Diretora primeiro.</p>
      <Suspense fallback={<ListaSkeleton />}>
        <VereadoresLista />
      </Suspense>
    </>
  );
}

async function VereadoresLista() {
  await connection();
  await requirePageSession();
  const vereadores = await listVereadores();

  if (vereadores.length === 0) {
    return (
      <div className="card mt-5 p-6 text-center text-sm text-muted">
        Nenhum vereador ainda. Os dados chegam pelo coletor semanal.
      </div>
    );
  }

  const mesa = vereadores.filter((v) => v.cargoMesa);
  const demais = vereadores.filter((v) => !v.cargoMesa);

  return (
    <>
      <Secao titulo="Mesa Diretora" itens={mesa} />
      <Secao titulo="Demais vereadores" itens={demais} />
    </>
  );
}

function Secao({
  titulo,
  itens,
}: {
  titulo: string;
  itens: Awaited<ReturnType<typeof listVereadores>>;
}) {
  if (itens.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</h2>
      <ul className="mt-3 space-y-3">
        {itens.map((v) => (
          <li key={v.id}>
            <VereadorCard vereador={v} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListaSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <VereadorCardSkeleton key={i} />
      ))}
    </div>
  );
}
