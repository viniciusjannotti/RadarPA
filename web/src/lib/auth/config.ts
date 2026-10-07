import { sessionVersion } from "@/lib/auth/token";

export type AuthConfig = {
  secret: Uint8Array;
  adminPassword: string;
  /** Muda quando a senha muda: invalida todas as sessões emitidas antes. */
  version: string;
};

type Env = Record<string, string | undefined>;

export const MIN_PASSWORD_LENGTH = 12;

/** Lê e valida a configuração de auth. Falha alto em vez de rodar com segredo fraco. */
export function readAuthConfig(env: Env = process.env): AuthConfig {
  const rawSecret = env.JWT_SECRET ?? "";
  const adminPassword = env.ADMIN_PASSWORD ?? "";
  if (rawSecret.length < 32) {
    throw new Error("JWT_SECRET ausente ou curto demais (mínimo 32 caracteres).");
  }
  if (adminPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD ausente ou curta demais (mínimo ${MIN_PASSWORD_LENGTH} caracteres).`,
    );
  }
  const secret = new TextEncoder().encode(rawSecret);
  return { secret, adminPassword, version: sessionVersion(secret, adminPassword) };
}
