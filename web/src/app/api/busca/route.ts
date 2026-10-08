import type { NextRequest } from "next/server";
import { json, requireApiSession } from "@/lib/api";
import { buscar } from "@/lib/busca";

export async function GET(request: NextRequest) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return json(await buscar(request.nextUrl.searchParams.get("q") ?? ""));
}
