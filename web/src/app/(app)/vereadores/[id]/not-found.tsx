import Link from "next/link";

export default function VereadorNaoEncontrado() {
  return (
    <div className="card mt-6 p-6 text-center">
      <p className="font-semibold">Vereador não encontrado</p>
      <Link href="/vereadores" className="chip mt-4">
        Voltar para Vereadores
      </Link>
    </div>
  );
}
