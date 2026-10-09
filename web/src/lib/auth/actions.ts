"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIpFrom } from "@/lib/auth/client-ip";
import { readAuthConfig } from "@/lib/auth/config";
import { LOGIN_PATH, safeNextPath } from "@/lib/auth/decision";
import { passwordMatches } from "@/lib/auth/password";
import { loginLimiter } from "@/lib/auth/login-limiter";
import { endSession, startSession } from "@/lib/auth/session";

// Rate limit só por IP (o IP vem do salto adicionado pelo proxy, não do cliente): 5
// falhas a cada 15 min. Não há teto global de propósito: ele deixaria qualquer um
// bloquear o dono com 30 senhas erradas. A força bruta fica contida pela senha de 12+
// caracteres e pelo atraso em cada falha.
const FAILURE_DELAY_MS = 1000;

export type LoginState = { error?: string } | undefined;

const GENERIC_ERROR = "Não foi possível entrar. Verifique a senha e tente de novo.";

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = clientIpFrom(await headers());
  let limit: Awaited<ReturnType<typeof loginLimiter.check>>;
  try {
    limit = await loginLimiter.check(ip);
  } catch (err) {
    // Sem o contador não há como limitar: recusa (fail closed) em vez de liberar.
    console.error("[auth] rate limit indisponível:", (err as Error).message);
    return { error: GENERIC_ERROR };
  }
  if (!limit.allowed) {
    const min = Math.max(1, Math.ceil(limit.retryAfterMs / 60000));
    return { error: `Muitas tentativas. Tente de novo em ${min} min.` };
  }

  let adminPassword: string;
  try {
    adminPassword = readAuthConfig().adminPassword;
  } catch (err) {
    // Detalhe só no log do servidor; para quem está na tela, é uma falha genérica.
    console.error("[auth] configuração inválida:", (err as Error).message);
    return { error: GENERIC_ERROR };
  }

  const password = String(formData.get("password") ?? "");
  if (!passwordMatches(password, adminPassword)) {
    await loginLimiter.fail(ip);
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return { error: GENERIC_ERROR };
  }

  await loginLimiter.reset(ip);
  await startSession();
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function logout(): Promise<void> {
  await endSession();
  redirect(LOGIN_PATH);
}
