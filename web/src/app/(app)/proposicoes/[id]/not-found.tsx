import Link from "next/link";

export default function ProposicaoNaoEncontrada() {
  return (
    <div className="card mt-6 p-6 text-center">
      <p className="font-semibold">Proposição não encontrada</p>
      <Link href="/busca" className="chip mt-4">
        Ir para a Busca
      </Link>
    </div>
  );
}
