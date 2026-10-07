import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="text-center">
        <span
          aria-hidden
          className="relative mx-auto grid size-16 place-items-center rounded-full border border-accent-2/50"
        >
          <span className="absolute inset-2 rounded-full border border-accent-2/25" />
          <span className="size-3 rounded-full bg-accent-2 shadow-[0_0_18px_var(--accent-2)]" />
        </span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">
          Radar <span className="text-accent">PA</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Câmara Municipal de Pouso Alegre</p>
      </div>
      <LoginForm />
    </main>
  );
}
