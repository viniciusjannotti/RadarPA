import { json, requireApiSession } from "@/lib/api";
import { listVereadores } from "@/lib/vereadores";

export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return json(await listVereadores());
}
