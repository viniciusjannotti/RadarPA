import { redirect } from "next/navigation";

export default function Home() {
  // O Dashboard entra na fatia 7; até lá, a home abre em Sessões.
  redirect("/sessoes");
}
