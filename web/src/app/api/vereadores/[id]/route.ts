import { json, requireApiSession } from "@/lib/api";
import { getVereador } from "@/lib/vereadores";

export async function GET(_request: Request, ctx: RouteContext<"/api/vereadores/[id]">) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { id } = await ctx.params;
  const v = /^\d{1,9}$/.test(id) ? await getVereador(Number(id)) : null;
  if (!v) return json({ error: "Vereador não encontrado" }, { status: 404 });

  // DTO explícito: sem campos internos de coleta.
  const { id: vid, gwlegisId, nomeParlamentar, partido, fotoUrl, email, status } = v;
  const { cargoMesa, comissoes, legislatura } = v;
  return json({
    id: vid,
    gwlegisId,
    nomeParlamentar,
    partido,
    fotoUrl,
    email,
    status,
    cargoMesa,
    comissoes,
    legislatura,
  });
}
