"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { login } from "@/lib/auth/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const error = state?.error;

  return (
    <form action={action} className="mt-8 space-y-4">
      {/* Só o destino (?next=) depende da URL; o formulário em si fica no shell estático,
          então o que for digitado antes da hidratação não se perde. */}
      <Suspense fallback={null}>
        <NextInput />
      </Suspense>
      <div>
        <label htmlFor="password" className="text-sm font-medium text-muted">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-erro" : undefined}
          className="mt-1.5 block h-12 w-full rounded-xl border border-line bg-surface-strong px-4 text-base text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>
      {error && (
        <p id="login-erro" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-accent font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

function NextInput() {
  return <input type="hidden" name="next" value={useSearchParams().get("next") ?? ""} />;
}
