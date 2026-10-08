import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sem conexão" };

// Página estática e pública: o service worker a guarda em cache e a mostra quando
// uma navegação falha por falta de rede. Não contém dados da Câmara.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      <span
        aria-hidden
        className="relative grid size-16 place-items-center rounded-full border border-muted/40"
      >
        <span className="size-3 rounded-full bg-muted" />
      </span>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">Sem conexão</h1>
      <p className="mt-2 text-sm text-muted">
        O Radar PA precisa de internet para mostrar os dados da Câmara. Confira a conexão e tente de novo.
      </p>
      <a href="/dashboard" className="chip mt-6">
        Tentar de novo
      </a>
    </main>
  );
}
