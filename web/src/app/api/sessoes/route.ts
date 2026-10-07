import type { NextRequest } from "next/server";
import { json, requireApiSession } from "@/lib/api";
import { firstParam, intParam } from "@/lib/search-params";
import { listSessoes } from "@/lib/sessoes";

export async function GET(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const result = await listSessoes({
    page: intParam(params, "pg"),
    tipo: firstParam(params, "tipo"),
    ano: intParam(params, "ano"),
  });
  return json(result);
}
