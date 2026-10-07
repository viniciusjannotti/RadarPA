export const LOGIN_PATH = "/login";

// Caminhos acessíveis sem sessão (o PWA precisa do manifest antes do login).
const PUBLIC_PATHS = new Set([LOGIN_PATH, "/manifest.webmanifest"]);

export type AuthDecision = "allow" | "redirect" | "unauthorized";

function isApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function authDecision(pathname: string, hasValidSession: boolean): AuthDecision {
  if (hasValidSession || PUBLIC_PATHS.has(pathname)) return "allow";
  if (isApi(pathname)) return "unauthorized";
  return "redirect";
}

const BASE = "http://radarpa.invalid";

/**
 * Destino pós-login: só caminhos internos de página, para não virar open redirect.
 * Valida parseando (como o navegador faria), não por prefixo: "/\t/evil.com" vira
 * "//evil.com" depois que o parser remove o tab.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\\]/.test(next)) return "/";

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE || url.pathname === LOGIN_PATH || isApi(url.pathname)) return "/";

  url.searchParams.delete("_rsc");
  return url.pathname + url.search;
}
