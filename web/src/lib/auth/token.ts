import { createHmac } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

// O prefixo __Host- exige Secure e Path=/ e impede que um subdomínio sobrescreva o cookie.
// Em dev (http) o navegador recusaria Secure fora de localhost, então fica sem prefixo.
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-radarpa_session" : "radarpa_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias (plano, seção 6.1)

// App de usuário único: o token só atesta "é o admin".
const SUBJECT = "admin";
const ISSUER = "radarpa";
const ALG = "HS256";

/** Derivado da senha: trocar ADMIN_PASSWORD revoga todas as sessões sem precisar de banco. */
export function sessionVersion(secret: Uint8Array, adminPassword: string): string {
  return createHmac("sha256", secret).update(adminPassword, "utf8").digest("base64url").slice(0, 22);
}

export async function signSession(
  secret: Uint8Array,
  version: string,
  issuedAt = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({ ver: version })
    .setProtectedHeader({ alg: ALG })
    .setSubject(SUBJECT)
    .setIssuer(ISSUER)
    .setAudience(ISSUER)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .sign(secret);
}

export async function verifySession(
  token: string | undefined,
  secret: Uint8Array,
  version: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALG],
      subject: SUBJECT,
      issuer: ISSUER,
      audience: ISSUER,
      requiredClaims: ["exp"],
    });
    return payload.ver === version;
  } catch {
    return false;
  }
}
