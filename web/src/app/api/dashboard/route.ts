import { json, requireApiSession } from "@/lib/api";
import { getDashboard } from "@/lib/dashboard";

export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return json(await getDashboard());
}
