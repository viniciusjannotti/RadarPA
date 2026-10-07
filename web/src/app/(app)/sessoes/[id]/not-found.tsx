import Link from "next/link";

export default function SessaoNaoEncontrada() {
  return (
    <div className="card mt-6 p-6 text-center">
      <p className="font-semibold">Sessão não encontrada</p>
      <Link href="/sessoes" className="chip mt-4">
        Voltar para Sessões
      </Link>
    </div>
  );
}
