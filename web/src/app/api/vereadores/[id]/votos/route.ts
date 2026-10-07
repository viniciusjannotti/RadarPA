import { json, requireApiSession } from "@/lib/api";
import { getVereador } from "@/lib/vereadores";
import { getResumoVereador } from "@/lib/votacoes";

export async function GET(_request: Request, ctx: RouteContext<"/api/vereadores/[id]/votos">) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { id } = await ctx.params;
  const v = /^\d{1,9}$/.test(id) ? await getVereador(Number(id)) : null;
  if (!v) return json({ error: "Vereador não encontrado" }, { status: 404 });

  return json({ vereadorId: v.id, ...(await getResumoVereador(v.id, 100)) });
}
