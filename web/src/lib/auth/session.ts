import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readAuthConfig } from "@/lib/auth/config";
import { LOGIN_PATH } from "@/lib/auth/decision";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from "@/lib/auth/token";

/**
 * Verificação de sessão perto dos dados (o proxy é a primeira barreira, esta é a segunda):
 * toda página com dados, Route Handler e Server Function deve chamar uma destas funções.
 */
export async function hasValidSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    const cfg = readAuthConfig();
    return await verifySession(token, cfg.secret, cfg.version);
  } catch (err) {
    console.error("[auth] configuração inválida:", (err as Error).message);
    return false;
  }
}

export async function requirePageSession(): Promise<void> {
  if (!(await hasValidSession())) redirect(LOGIN_PATH);
}

export async function startSession(): Promise<void> {
  const cfg = readAuthConfig();
  const token = await signSession(cfg.secret, cfg.version);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
